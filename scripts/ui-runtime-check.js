#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(name, pass, detail='') { console.log(`${pass ? 'OK' : 'FAIL'} ui-static-runtime-check: ${name}${detail ? ' — ' + detail : ''}`); if (!pass) process.exitCode = 1; }
const pkg = require('../package.json');
const renderer = read('src/renderer.js');
const admin = read('src/admin-renderer.js');
const index = read('src/index.html');
const style = read('src/style.css');
const adminCss = read('src/admin.css');
ok('package semver present', /^\d+\.\d+\.\d+/.test(pkg.version), pkg.version);
ok('client has runtime check entrypoint', renderer.includes('nv143RuntimeCheck') && renderer.includes('Real UI Runtime Check'));
ok('emoji close routed safely', read('src/client/ui-action-router.js').includes('emoji.close') && !read('src/client/ui-action-router.js').includes('UI action не распознано'));
ok('context menu final helper loaded', index.includes('client/ui/context-menu.js') && read('src/client/ui/context-menu.js').includes('NvContextMenu'));
ok('theme preview lab present', renderer.includes('Theme Preview Lab') && style.includes('nv143ThemeLab'));
ok('voice recorder present', renderer.includes('Voice Recorder 2.2') && read('src/client/media/voice.js').includes('testMicrophone'));
ok('media viewer present', read('src/client/media/viewer.js').includes('Media Viewer 2.2') && renderer.includes('nv143OpenMediaLab'));
ok('admin dashboard present', admin.includes('Admin Dashboard 3.1') && admin.includes('activeUsers5m'));
ok('admin logs search/export present', admin.includes('Admin Logs 3.1') && admin.includes('exportLogs'));
ok('radmin helper present', admin.includes('Radmin Helper 3.1') && admin.includes('QR-код'));
ok('native controls themed', style.includes('Native Controls Final Cleanup') && adminCss.includes('Native Controls Final Cleanup'));
if (process.exitCode) process.exit(1);
console.log(`NightVault ${pkg.version} UI static runtime check passed. Use verify:electron for a real Electron window smoke.`);
