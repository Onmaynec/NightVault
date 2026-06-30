#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const version = require(path.join(root, "package.json")).version;
const out = path.join(root, "dist", `NightVault-${version}-source.zip`);
const excluded = ["node_modules", "dist", "server/runtime", "uploads", ".git", "debug-packs", "tester-reports"];
fs.mkdirSync(path.dirname(out), { recursive: true });
const git = spawnSync("git", ["archive", "--format=zip", `--output=${out}`, "HEAD"], { cwd: root, stdio: "inherit" });
if (git.status === 0) {
  console.log("created", out);
  process.exit(0);
}
console.warn("git archive failed; create source zip manually excluding:", excluded.join(", "));
process.exit(git.status || 1);
