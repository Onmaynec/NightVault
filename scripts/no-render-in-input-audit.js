#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const files = ["src/renderer.js", "src/admin-renderer.js", "src/client/ui-action-router.js", "src/client/ui-action-router-147.js"].filter((f) => fs.existsSync(path.join(root, f)));
let failures = 0;
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const patterns = [
    /oninput\s*=\s*(["'])[\s\S]*?render\s*\([\s\S]*?\1/gi,
    /addEventListener\s*\(\s*(["'])input\1[\s\S]{0,240}?render\s*\(/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      failures += 1;
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      console.error(`FAIL no-render-in-input: ${file}:${line}`);
    }
  }
}
if (failures) process.exit(1);
console.log("NightVault 1.4.7 no-render-in-input audit passed.");
