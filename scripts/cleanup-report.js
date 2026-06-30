#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const junkDirs = new Set(["node_modules", "dist", "out", "coverage", ".cache", ".parcel-cache"]);
const junkFiles = [/\.log$/i, /\.tmp$/i, /\.bak$/i, /~$/i, /^npm-debug\.log$/i, /^yarn-error\.log$/i, /^admin-first-login\.txt$/i];
const keepRuntime = new Set(["server/runtime/.gitkeep"]);
const findings = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git") continue;
    const full = path.join(dir, name);
    const rel = path.relative(root, full).replace(/\\/g, "/");
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (junkDirs.has(name)) findings.push({ type: "directory", path: rel, reason: "generated dependency/build/cache directory" });
      else walk(full);
      continue;
    }
    if (keepRuntime.has(rel)) continue;
    if (junkFiles.some((re) => re.test(name))) findings.push({ type: "file", path: rel, reason: "temporary/log/backup artifact" });
    if (/^RELEASE_(NOTES|MANIFEST)_/i.test(name)) findings.push({ type: "file", path: rel, reason: "old root release artifact; use release-history/" });
    if (/server\/runtime\//.test(rel) && !/\.gitkeep$/.test(rel)) findings.push({ type: "file", path: rel, reason: "runtime data must not be committed" });
  }
}
walk(root);
for (const item of findings) console.log(`CLEANUP ${item.type}: ${item.path} — ${item.reason}`);
console.log(`cleanup-report ok — ${findings.length} candidate(s) found. Review before deleting.`);
