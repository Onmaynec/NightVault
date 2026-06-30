#!/usr/bin/env node
const fs = require('fs');
const renderer = fs.readFileSync('src/renderer.js','utf8');
const css = fs.readFileSync('src/style.css','utf8');
const checks = [
  ['context menu bounds', renderer.includes('nv140BoundMenu')],
  ['E2EE decrypted cache', renderer.includes('nv140Decrypted_')],
  ['adaptive UI rules', css.includes('Adaptive') || css.includes('UI Kit 2.0')],
  ['mention contrast chip', css.includes('mentionChip')],
  ['modal spacing fixed', css.includes('--nv-gap')],
];
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass?'OK':'FAIL'} perf-audit: ${name}`); if(!pass) ok=false; }
if(!ok) process.exit(1);
