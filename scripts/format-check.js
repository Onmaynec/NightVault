"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const targets = ["package.json", "src/index.html", "src/admin.html"];
let ok = true;
for (const rel of targets) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  if (!text.endsWith("\n")) { console.error(`format: ${rel} must end with newline`); ok = false; }
  if (/\t/.test(text)) { console.error(`format: ${rel} contains tabs`); ok = false; }
}
if (!ok) process.exit(1);
console.log("format ok");
