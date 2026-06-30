#!/usr/bin/env node
"use strict";
const { spawnSync } = require("child_process");
const steps = [
  ["version:check", ["run", "version:check"]],
  ["cleanup:report", ["run", "cleanup:report"]],
  ["ui-actions:report", ["run", "ui-actions:report"]],
  ["duplicate-globals-audit", ["run", "duplicate-globals-audit"]],
  ["release:preflight", ["run", "release:preflight"]],
  ["release-assets-check", ["run", "release-assets-check"]],
];
let failed = 0;
for (const [name, args] of steps) {
  console.log(`\n=== release-qa: ${name} ===`);
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { stdio: "inherit" });
  if (result.status) failed += 1;
}
if (failed) process.exit(1);
console.log("release-qa ok — static release QA completed. Run real Electron smoke separately on Windows/test VM.");
