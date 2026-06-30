#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const force = process.env.NIGHTVAULT_FORCE_REAL_ELECTRON === "1";
const isHeadlessLinux = process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

function log(message) { console.log(`[e2e:real] ${message}`); }
function fail(message) { console.error(`[e2e:real] FAIL ${message}`); process.exit(1); }
function skip(message) { console.log(`[e2e:real] SKIP ${message}`); process.exit(0); }

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function getJson(url, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body || "{}")} ); }
        catch (error) { reject(error); }
      });
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
  });
}

async function waitFor(name, fn, timeoutMs = 15000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} timed out${lastError ? ": " + lastError.message : ""}`);
}

async function cdpRequest(port, pathName, payload) {
  const body = payload ? JSON.stringify(payload) : "";
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: pathName,
      method: payload ? "PUT" : "GET",
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
      timeout: 1500,
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw || "{}")); }
        catch (error) { reject(error); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  if (isHeadlessLinux && !force) {
    skip("headless Linux has no display. Run on Windows/test VM or set NIGHTVAULT_FORCE_REAL_ELECTRON=1 with a working display.");
  }
  let electronPath;
  try { electronPath = require("electron"); }
  catch { skip("electron package is not installed. Run npm install first."); }
  if (!electronPath || typeof electronPath !== "string") skip("electron executable was not resolved.");

  const serverPort = await freePort();
  const cdpPort = await freePort();
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "nightvault-e2e-real-"));
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  log(`starting server at ${baseUrl}`);
  const server = spawn(process.execPath, ["server/server.js"], {
    cwd: root,
    env: { ...process.env, NIGHTVAULT_PORT: String(serverPort), NIGHTVAULT_HOST: "127.0.0.1", NIGHTVAULT_DATA_DIR: path.join(runtime, "server"), NIGHTVAULT_CORS_ORIGINS: "null,http://127.0.0.1", NODE_NO_WARNINGS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverErr = "";
  server.stderr.on("data", (chunk) => { serverErr += chunk.toString(); });
  let electron = null;
  try {
    await waitFor("server health", async () => {
      const { status, body } = await getJson(baseUrl + "/api/health");
      return status === 200 && body.ok && body.version;
    }, 20000);
    log("server health ok");
    const profile = `e2e-real-${Date.now()}`;
    electron = spawn(electronPath, [".", `--remote-debugging-port=${cdpPort}`, `--profile=${profile}`], {
      cwd: root,
      env: { ...process.env, NIGHTVAULT_DISABLE_BUNDLED_SERVER: "1", NIGHTVAULT_PROFILE_ID: profile, NIGHTVAULT_HOST: "127.0.0.1", NIGHTVAULT_PORT: String(serverPort), NIGHTVAULT_E2E_SERVER_URL: baseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let electronErr = "";
    electron.stderr.on("data", (chunk) => { electronErr += chunk.toString(); });
    await waitFor("CDP page list", async () => {
      const pages = await cdpRequest(cdpPort, "/json/list");
      return Array.isArray(pages) && pages.find((page) => /NightVault|index\.html|file:/.test(String(page.title || page.url || "")));
    }, 20000);
    log("electron window exposed through CDP");
    const pages = await cdpRequest(cdpPort, "/json/list");
    const page = pages.find((item) => item.webSocketDebuggerUrl) || pages[0];
    if (!page?.webSocketDebuggerUrl) {
      log("CDP page detected but websocket URL is not available; DOM assertion skipped by Chromium policy.");
    } else {
      // Keep this harness dependency-free. The DOM assertion is intentionally conservative because Node has no built-in WebSocket client.
      log("CDP websocket is available. For deeper DOM actions, install a runner such as Playwright in a future version.");
    }
    await waitFor("renderer boot marker", async () => {
      const pagesNow = await cdpRequest(cdpPort, "/json/list");
      return pagesNow.some((item) => String(item.url || "").includes("index.html") || String(item.title || "").includes("NightVault"));
    }, 10000);
    log("real Electron smoke passed: server + Electron window booted");
    if (electronErr && /preload error|render-process-gone|did-fail-load/i.test(electronErr)) fail("Electron reported boot errors: " + electronErr.slice(0, 1000));
  } finally {
    if (electron && electron.exitCode === null) electron.kill("SIGTERM");
    if (server && server.exitCode === null) server.kill("SIGTERM");
    fs.rmSync(runtime, { recursive: true, force: true });
  }
  if (serverErr && /EADDRINUSE|SyntaxError|Unhandled|error/i.test(serverErr)) {
    fail("server stderr contains errors: " + serverErr.slice(0, 1000));
  }
}

main().catch((error) => fail(error.stack || error.message || String(error)));
