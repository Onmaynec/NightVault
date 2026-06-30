#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
async function waitForServer(baseUrl, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) throw new Error(`server exited: ${child.exitCode}`);
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("server did not start");
}
async function jsonRequest(baseUrl, route, { token, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(baseUrl + "/api" + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
function e2eeBody(username) {
  return {
    username,
    e2eeDeviceId: crypto.randomBytes(16).toString("hex"),
    e2eePublicKey: {
      kty: "EC",
      crv: "P-256",
      x: "A".repeat(43),
      y: "B".repeat(43),
      ext: true,
    },
  };
}
async function run() {
  const port = await freePort();
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "nightvault-fresh-db-"));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NIGHTVAULT_PORT: String(port),
      NIGHTVAULT_HOST: "127.0.0.1",
      NIGHTVAULT_DATA_DIR: runtime,
      NIGHTVAULT_CORS_ORIGINS: "null,http://allowed.example",
      NODE_NO_WARNINGS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const health = await waitForServer(baseUrl, child);
    assert.equal(health.version, require("../package.json").version);
    assert.equal(health.schemaVersion >= 13, true);

    const alice = await jsonRequest(baseUrl, "/register", {
      method: "POST",
      body: { ...e2eeBody("alice145"), displayName: "Alice 145", password: "alice-password-145" },
    });
    assert.equal(alice.response.status, 201, JSON.stringify(alice.data));
    const bob = await jsonRequest(baseUrl, "/register", {
      method: "POST",
      body: { ...e2eeBody("bob145"), displayName: "Bob 145", password: "bob-password-145" },
    });
    assert.equal(bob.response.status, 201, JSON.stringify(bob.data));

    const request = await jsonRequest(baseUrl, "/contacts/bob145/request", { method: "POST", token: alice.data.accessToken, body: {} });
    assert.equal(request.response.status, 200, JSON.stringify(request.data));
    const accept = await jsonRequest(baseUrl, "/contacts/alice145/accept", { method: "POST", token: bob.data.accessToken, body: {} });
    assert.equal(accept.response.status, 200, JSON.stringify(accept.data));

    const chat = await jsonRequest(baseUrl, "/chats/private/bob145", { method: "POST", token: alice.data.accessToken, body: {} });
    assert.equal(chat.response.status, 200, JSON.stringify(chat.data));
    const chatId = chat.data.chat.id;
    const devices = await jsonRequest(baseUrl, `/chats/${chatId}/e2ee-devices`, { token: alice.data.accessToken });
    assert.equal(devices.response.status, 200, JSON.stringify(devices.data));
    assert.equal(devices.data.devices.length >= 2, true);

    const form = new FormData();
    form.append("file", new Blob(["fresh-db-file"], { type: "text/plain" }), "fresh-db.txt");
    const upload = await fetch(baseUrl + "/api/files", { method: "POST", headers: { Authorization: `Bearer ${alice.data.accessToken}` }, body: form });
    assert.equal(upload.status, 201, await upload.text().catch(() => ""));
    const uploaded = await upload.json();

    const sent = await jsonRequest(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      token: alice.data.accessToken,
      body: { text: "fresh db ok", attachment: { id: uploaded.id } },
    });
    assert.equal(sent.response.status, 201, JSON.stringify(sent.data));
    const page = await jsonRequest(baseUrl, `/chats/${chatId}/messages?limit=10`, { token: bob.data.accessToken });
    assert.equal(page.response.status, 200, JSON.stringify(page.data));
    assert.equal(page.data.messages.some((m) => m.text === "fresh db ok"), true);

    const readiness = await jsonRequest(baseUrl, "/readiness", {});
    assert.equal([200, 503].includes(readiness.response.status), true);
    console.log("fresh-db-smoke ok — clean data dir register/chat/upload/e2ee/readiness flow passed");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000).unref();
    });
    fs.rmSync(runtime, { recursive: true, force: true });
    if (stderr.trim()) console.warn("fresh-db-smoke server stderr:", stderr.trim());
  }
}
run().catch((error) => {
  console.error("fresh-db-smoke failed:", error);
  process.exit(1);
});
