#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function read(file) { return fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : ""; }
function ok(name, pass, detail = "") { console.log(`${pass ? "OK" : "FAIL"} legacy-audit: ${name}${detail ? " — " + detail : ""}`); if (!pass) process.exitCode = 1; }
const renderer = read("src/renderer.js");
const actions = read("src/renderer/actions.js");
const router = read("src/client/ui-action-router-147.js");
ok("legacy actions bridge still present", actions.includes("NVActionBridge"));
ok("1.4.7 action router present", router.includes("NV147ActionRouter"));
ok("nvBindPartial shim present", router.includes("nvBindPartial") || renderer.includes("nvBindPartial"));
ok("legacy compatibility docs present", fs.existsSync(path.join(root, "docs/LEGACY_COMPATIBILITY_MAP.md")));
ok("UI actions map present", fs.existsSync(path.join(root, "docs/UI_ACTIONS_MAP.md")));
if (process.exitCode) process.exit(1);
console.log("NightVault 1.4.7 legacy compatibility audit passed.");
