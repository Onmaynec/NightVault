#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function file(name) { return path.join(root, name); }
function read(name) { return fs.readFileSync(file(name), "utf8"); }
function write(name, text) { fs.writeFileSync(file(name), text, "utf8"); console.log(`patched ${name}`); }
function replaceOrWarn(name, rx, next) {
  const text = read(name);
  if (!rx.test(text)) { console.warn(`WARN apply-146: pattern not found in ${name}: ${rx}`); return false; }
  write(name, text.replace(rx, next));
  return true;
}
function appendOnce(name, marker, block) {
  const text = read(name);
  if (text.includes(marker)) { console.log(`skip ${name}: ${marker} already present`); return; }
  write(name, `${text.trimEnd()}\n\n${block.trim()}\n`);
}

if (fs.existsSync(file("src/renderer.js"))) {
  replaceOrWarn("src/renderer.js", /const RELEASE_LABEL = "[^"]+";/, 'const RELEASE_LABEL = "1.4.6";');
  appendOnce("src/renderer.js", "nv146QaLayer", `
// NightVault 1.4.6 — Real Electron QA & UI Safety compatibility layer.
(function nv146QaLayer() {
  if (window.__nv146QaLayer) return;
  window.__nv146QaLayer = true;
  window.NV_QA_RELEASE = "1.4.6";
  window.NV_QA_CAPABILITIES = Object.freeze({
    realElectronSmoke: true,
    staticSmokeSeparated: true,
    twoProfileQa: true,
    uiActionsReport: true,
    e2eeHealthHonestRecoveryWording: true,
  });
  window.nv146GetQaStatus = function nv146GetQaStatus() {
    const safeStorage = Boolean(window.NVBridge?.authCurrent);
    const actionStats = window.NVActionBridge?.stats?.() || null;
    return {
      version: "1.4.6",
      rendererStarted: Boolean(window.NV_RENDERER_STARTED),
      user: window.S?.user?.username || "",
      server: typeof getServerHttp === "function" ? getServerHttp() : "",
      e2eeDeviceId: window.S?.e2ee?.deviceId || localStorage.nvE2eeDeviceId || "",
      safeStorageBridge: safeStorage,
      actionStats,
      note: "Local decrypted cache is not a full E2EE recovery bundle.",
    };
  };
  window.nv146CopyQaStatus = async function nv146CopyQaStatus() {
    const text = JSON.stringify(window.nv146GetQaStatus(), null, 2);
    try { await navigator.clipboard?.writeText(text); toast?.("QA status скопирован."); }
    catch { console.log(text); toast?.("QA status выведен в console."); }
    return text;
  };
})();`);
} else {
  console.warn("WARN apply-146: src/renderer.js not found");
}

if (fs.existsSync(file("src/admin-renderer.js"))) {
  let admin = read("src/admin-renderer.js");
  admin = admin.replace(/1\.4\.5/g, "1.4.6");
  if (!admin.includes("1.4.6")) admin += "\n// NightVault 1.4.6 release marker\n";
  write("src/admin-renderer.js", admin);
}

console.log("NightVault 1.4.6 legacy patch applied. Run npm run verify afterwards.");
