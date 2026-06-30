#!/usr/bin/env node
"use strict";

const fs = require("fs");
function read(file) { return fs.readFileSync(file, "utf8"); }
const checks = [
  ["1.4.7 router layer", read("src/client/ui-action-router-147.js").includes("NV147ActionRouter")],
  ["strict CSP diagnostics", read("src/renderer/strict-csp.js").includes("securitypolicyviolation")],
  ["admin actions layer", read("src/admin-actions.js").includes("NVAdminActions147")],
  ["renderer compatibility layer", read("src/renderer.js").includes("nv147UiActionLayer")],
  ["client index loads router", read("src/index.html").includes("client/ui-action-router-147.js")],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "ok" : "fail"} e2e:static ${name}`); if (!ok) failed += 1; }
if (failed) process.exit(1);
console.log("NightVault 1.4.7 static smoke passed.");
