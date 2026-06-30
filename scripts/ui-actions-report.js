#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const attrs = ["onclick", "oninput", "onchange", "onscroll", "ondrop", "oncontextmenu", "ondblclick", "onmousedown", "onmouseup", "ontouchstart", "ontouchend"];
function walk(dir, out = []) { if (!fs.existsSync(dir)) return out; for (const name of fs.readdirSync(dir)) { const p = path.join(dir, name); const st = fs.statSync(p); if (st.isDirectory()) walk(p, out); else if (/\.(html|js)$/i.test(name)) out.push(p); } return out; }
function status(value) {
  if (/^\w+\(/.test(value) || /^\w+\?\.\(/.test(value)) return "legacy-required";
  if (/^localStorage\.|^S\./.test(value)) return "legacy-removable";
  if (/document\.querySelector/.test(value)) return "router-ready";
  return "review";
}
const rows = [];
for (const file of walk(path.join(root, "src"))) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  for (const attr of attrs) {
    const pattern = new RegExp(`${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "gi");
    let match;
    while ((match = pattern.exec(text))) rows.push({ file: rel, attr, status: status(match[2].trim()), expression: match[2].trim().slice(0, 180) });
  }
}
const byFile = new Map();
for (const row of rows) byFile.set(row.file, (byFile.get(row.file) || 0) + 1);
console.log("NightVault UI Actions Report 1.4.7");
console.log(`Total legacy inline handlers: ${rows.length}`);
console.log("Top files:");
[...byFile.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 20).forEach(([file,count]) => console.log(`- ${file}: ${count}`));
console.log("\nDetails:");
rows.forEach((row) => console.log(`${row.status}\t${row.file}\t${row.attr}\t${row.expression}`));
