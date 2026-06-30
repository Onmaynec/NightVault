#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file){ return fs.existsSync(path.join(root, file)); }
const pkg = require('../package.json');
const renderer = read('src/renderer.js');
const admin = read('src/admin-renderer.js');
const index = read('src/index.html');
const style = read('src/style.css');
const adminCss = read('src/admin.css');
const actionRouter = read('src/client/ui-action-router.js');
const checks = [
  ['package version 1.4.4', pkg.version === '1.4.4'],
  ['ui action router file', exists('src/client/ui-action-router.js') && index.includes('client/ui-action-router.js')],
  ['voice module 2.2', exists('src/client/media/voice.js') && read('src/client/media/voice.js').includes('Voice Recorder 2.2')],
  ['media viewer module 2.2', exists('src/client/media/viewer.js') && read('src/client/media/viewer.js').includes('Media Viewer 2.2')],
  ['context menu 4.0', exists('src/client/ui/context-menu.js') && read('src/client/ui/context-menu.js').includes('NvContextMenu')],
  ['UI Action Router 2.0 actions', actionRouter.includes('settings.microphone.refresh') && actionRouter.includes('tester.report') && actionRouter.includes('backup.preview')],
  ['E2EE recovery 2.2 screen', renderer.includes('nv143OpenE2eeChatStatus') && renderer.includes('Повторить расшифровку')],
  ['backup assistant 2.2', renderer.includes('nv143BackupAssistant') && admin.includes('backup dry-run')],
  ['native controls final cleanup', style.includes('Native Controls Final Cleanup') && adminCss.includes('Native Controls Final Cleanup')],
  ['theme preview lab', renderer.includes('Theme Preview Lab') && style.includes('nv143ThemeLab')],
  ['public tester mode 2.0', renderer.includes('Tester Debug Report') && renderer.includes('nv143TesterReport')],
  ['runtime/e2e/native audit scripts', exists('scripts/ui-runtime-check.js') && exists('scripts/e2e-tester-flow.js') && exists('scripts/native-controls-audit.js')],
  ['visual checklist', exists('VISUAL_CHECKLIST.md') && read('VISUAL_CHECKLIST.md').includes('1.4.4')],
];
let passAll = true;
for (const [name, pass] of checks) { console.log(`${pass ? 'OK' : 'FAIL'} architecture-audit: ${name}`); if (!pass) passAll = false; }
if (!passAll) process.exit(1);
console.log('NightVault 1.4.4 architecture audit passed.');
