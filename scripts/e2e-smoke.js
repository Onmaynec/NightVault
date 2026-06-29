"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "src", "admin-renderer.js"), "utf8");
const checks = [
  [renderer.includes("manualSyncPush"), "client has sync push"],
  [renderer.includes("openE2eeTrust"), "client has E2EE trust screen helper"],
  [renderer.includes("searchLocalDecryptedIndex"), "client has local E2EE search"],
  [admin.includes("Настоящий Admin Test Center"), "admin test center rendered"],
  [admin.includes("debugReport"), "admin debug report action"],
];
for (const [ok, name] of checks) { if (!ok) throw new Error(`e2e smoke failed: ${name}`); console.log("ok", name); }
console.log("e2e smoke ok — static Electron flow checks passed");
