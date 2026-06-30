#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file){ return fs.existsSync(path.join(root, file)); }
const pkg = require('../package.json');
const renderer = read('src/renderer.js');
const index = read('src/index.html');
const style = read('src/style.css');
const adminCss = read('src/admin.css');
const checks = [
  ['package version 1.4.2', pkg.version === '1.4.2'],
  ['ui action router file', exists('src/client/ui-action-router.js') && index.includes('client/ui-action-router.js')],
  ['voice module placeholder', exists('src/client/media/voice.js') && index.includes('client/media/voice.js')],
  ['media viewer module placeholder', exists('src/client/media/viewer.js') && index.includes('client/media/viewer.js')],
  ['context menu module placeholder', exists('src/client/ui/context-menu.js') && index.includes('client/ui/context-menu.js')],
  ['E2EE recovery screen 2.1', renderer.includes('nv142OpenE2eeRecovery') && renderer.includes('Backup Compatibility Matrix')],
  ['backup dry-run/preflight IPC support', read('src/main.js').includes('admin-import-preview') && read('src/admin-preload.js').includes('importPreview')],
  ['native controls themed', style.includes('NightVault 1.4.2') && (style.includes('color-scheme: dark') || style.includes('color-scheme:dark')) && adminCss.includes('NightVault 1.4.2')],
  ['public tester mode', renderer.includes('nv142TesterMode') && renderer.includes('Public Tester Mode')],
  ['release preflight script', exists('scripts/release-preflight.js')],
  ['windows smoke test script', exists('scripts/windows-smoke-test.bat')],
  ['visual checklist', exists('VISUAL_CHECKLIST.md')],
];
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? 'OK' : 'FAIL'} architecture-audit: ${name}`); if(!pass) ok = false; }
if (!ok) process.exit(1);
