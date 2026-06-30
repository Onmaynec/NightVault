#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const version = pkg.version;
const files = ["README.md", "RELEASE_GUIDE.md", "assets/changelog.json", `release-history/read_version${version}RELEASE.md`];
let failed = 0;
for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { console.error("FAIL version-consistency: missing", file); failed += 1; continue; }
  const text = fs.readFileSync(full, "utf8");
  if (!text.includes(version)) { console.error("FAIL version-consistency: missing version", file, version); failed += 1; }
  else console.log("OK version-consistency:", file, version);
}
if (failed) process.exit(1);
console.log(`NightVault version consistency passed for ${version}.`);
