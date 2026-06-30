#!/usr/bin/env node
const fs = require('fs');
const checks = [
  ['package version 1.4.1', () => require('../package.json').version === '1.4.1'],
  ['renderer has local PIN lock', () => fs.readFileSync('src/renderer.js','utf8').includes('nv140PinSetup')],
  ['renderer has safety number UI', () => fs.readFileSync('src/renderer.js','utf8').includes('nv140SafetyNumber')],
  ['server has security audit endpoint', () => fs.readFileSync('server/server.js','utf8').includes('/api/security/audit')],
  ['server supports forwarded file clone', () => fs.readFileSync('server/server.js','utf8').includes('cloneFileRecordForChat')],
  ['changelog has 1.4.1 items', () => fs.readFileSync('assets/changelog.json','utf8').includes('Security & Messenger Pro Update')],
];
let ok = true;
for (const [name, fn] of checks) { const pass = Boolean(fn()); console.log(`${pass?'OK':'FAIL'} security-pro-audit: ${name}`); if(!pass) ok=false; }
if(!ok) process.exit(1);
