#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const scanDirs = ["src"];
const eventAttrs = ["onclick", "oninput", "onchange", "onscroll", "ondrop", "oncontextmenu", "ondblclick", "onmousedown", "onmouseup", "ontouchstart", "ontouchend"];
const legacyAllow = [
  "event.stopPropagation()",
  "event.preventDefault()",
  "closeEmojiPanel()",
  "document.querySelector('.ctx')?.remove()",
  "document.querySelector(\".ctx\")?.remove()",
  "document.querySelector('.emojiPanel')?.remove()",
  "document.querySelector(\".emojiPanel\")?.remove()",
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(html|js)$/i.test(name)) out.push(full);
  }
  return out;
}

function lineFor(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

let failures = 0;
let legacyCount = 0;
let routerCount = 0;
for (const dir of scanDirs) {
  for (const file of walk(path.join(root, dir))) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    const text = fs.readFileSync(file, "utf8");
    const routerMatches = text.match(/data-action\s*=|data-admin-action\s*=/g) || [];
    routerCount += routerMatches.length;
    for (const attr of eventAttrs) {
      const pattern = new RegExp(`${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "gi");
      let match;
      while ((match = pattern.exec(text))) {
        legacyCount += 1;
        const value = match[2].trim();
        const allowed = legacyAllow.includes(value) || /^\w+\?*\.?\(/.test(value) || /^\w+\(/.test(value) || /^S\.[a-zA-Z0-9_$]+\s*=/.test(value) || /^localStorage\.[a-zA-Z0-9_$]+\s*=/.test(value);
        const line = lineFor(text, match.index);
        if (!allowed) {
          failures += 1;
          console.error(`FAIL ui-actions-audit: unsupported legacy ${attr} in ${rel}:${line} — ${value.slice(0, 140)}`);
        } else {
          console.log(`LEGACY ui-actions-audit: ${rel}:${line} ${attr} — ${value.slice(0, 100)}`);
        }
      }
    }
  }
}
console.log(`ui-actions-audit summary: router=${routerCount} legacy=${legacyCount} failures=${failures}`);
if (legacyCount > 0) console.warn("ui-actions-audit: legacy inline handlers remain. 1.4.7 allows documented legacy only; convert remaining handlers in 1.4.8/1.5.");
if (failures) process.exit(1);
