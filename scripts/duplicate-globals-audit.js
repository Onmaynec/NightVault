#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const targets = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.js$/i.test(name)) targets.push(p);
  }
}
walk(path.join(root, "src", "renderer"));
if (fs.existsSync(path.join(root, "src", "renderer.js"))) targets.push(path.join(root, "src", "renderer.js"));
const seen = new Map();
const duplicates = [];
for (const file of targets) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  const rx = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|window\.([A-Za-z_$][\w$]*)\s*=)/g;
  let match;
  while ((match = rx.exec(text))) {
    const name = match[1] || match[2];
    if (!name || name.startsWith("nv144") || name.startsWith("nv145") || name.startsWith("nv146")) continue;
    const prior = seen.get(name);
    if (prior && prior !== rel) duplicates.push({ name, first: prior, second: rel });
    else seen.set(name, rel);
  }
}
if (duplicates.length) {
  console.log("duplicate-globals-audit warnings:");
  for (const item of duplicates.slice(0, 50)) console.log(`WARN duplicate global ${item.name}: ${item.first} / ${item.second}`);
  console.log(`duplicate-globals-audit completed with ${duplicates.length} warnings. Treat as report-first for 1.4.6.`);
} else {
  console.log("duplicate-globals-audit ok — no duplicate renderer globals found.");
}
