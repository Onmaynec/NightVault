#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const version = require(path.join(root, "package.json")).version;
const dist = path.join(root, "dist");
const expected = [
  `NightVault-Setup-${version}.exe`,
  `NightVault-Setup-${version}.exe.blockmap`,
  `NightVault-${version}-x64.exe`,
  "latest.yml",
  "checksums.sha256",
  `NightVault-${version}-source.zip`,
];
let failed = 0;
for (const name of expected) {
  const ok = fs.existsSync(path.join(dist, name)) || fs.existsSync(path.join(root, name));
  console.log(`${ok ? "OK" : "MISSING"} release-asset: ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.warn(`release-assets-check: ${failed} expected assets are missing. Build release before publishing.`);
  process.exitCode = 1;
}
