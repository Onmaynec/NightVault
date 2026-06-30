#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(name, pass, detail='') { console.log(`${pass ? 'OK' : 'FAIL'} release-preflight: ${name}${detail ? ' — ' + detail : ''}`); if(!pass) process.exitCode = 1; }
const pkg = require('../package.json');
const workflow = read('.github/workflows/release.yml');
const main = read('src/main.js');
ok('package semver 1.4.2', pkg.version === '1.4.2', pkg.version);
ok('tag shape vX.X.X documented', read('RELEASE_GUIDE.md').includes('v1.4.2') || read('RELEASE_GUIDE.md').includes('vX.X.X'));
ok('workflow exists', workflow.includes('Build and publish NightVault'));
ok('electron-builder publish never in workflow', workflow.includes('--publish never'));
ok('softprops uploads assets', workflow.includes('softprops/action-gh-release') && workflow.includes('dist/*.exe') && workflow.includes('dist/*.yml') && workflow.includes('dist/*.blockmap'));
ok('github repo Onmaynec/NightVault', JSON.stringify(pkg.build.publish).includes('Onmaynec') && JSON.stringify(pkg.build.publish).includes('NightVault'));
ok('runtime not inside app.asar', main.includes('app.isPackaged') && main.includes('process.resourcesPath'));
ok('nsis installer configured', JSON.stringify(pkg.build.nsis || {}).includes('NightVault-Setup'));
ok('portable target configured', JSON.stringify(pkg.build.win || {}).includes('portable'));
if (process.exitCode) process.exit(1);
console.log('NightVault 1.4.2 release preflight passed.');
