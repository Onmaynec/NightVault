#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(name, pass, detail='') { console.log(`${pass ? 'OK' : 'FAIL'} release-preflight: ${name}${detail ? ' — ' + detail : ''}`); if(!pass) process.exitCode = 1; }
const pkg = require('../package.json');
const version = pkg.version;
const workflow = read('.github/workflows/release.yml');
const main = read('src/main.js');
const renderer = read('src/renderer.js');
const admin = read('src/admin-renderer.js');
const changelog = read('assets/changelog.json');
ok('package semver', /^\d+\.\d+\.\d+$/.test(version), version);
ok('release notes current version', fs.existsSync(path.join(root, 'release-history', `read_version${version}RELEASE.md`)));
ok('changelog has current version', changelog.includes(`"version": "${version}"`));
ok('renderer has compatibility release labels', renderer.includes('1.4.4') || renderer.includes(version));
ok('admin has compatibility release labels', admin.includes('1.4.4') || admin.includes(version));
ok('tag shape documented', read('RELEASE_GUIDE.md').includes(`v${version}`) || read('RELEASE_GUIDE.md').includes('vX.X.X'));
ok('workflow exists', workflow.includes('Build and publish NightVault'));
ok('electron-builder publish never in workflow', workflow.includes('--publish never'));
ok('softprops uploads assets', workflow.includes('softprops/action-gh-release') && workflow.includes('dist/*.exe') && workflow.includes('dist/*.yml') && workflow.includes('dist/*.blockmap'));
ok('github repo Onmaynec/NightVault', JSON.stringify(pkg.build.publish).includes('Onmaynec') && JSON.stringify(pkg.build.publish).includes('NightVault'));
ok('runtime not inside app.asar', main.includes('app.isPackaged') && main.includes('process.resourcesPath'));
ok('nsis installer configured', JSON.stringify(pkg.build.nsis || {}).includes('NightVault-Setup'));
ok('portable target configured', JSON.stringify(pkg.build.win || {}).includes('portable'));
ok('preflight includes setup/latest/blockmap expectation', read('RELEASE_GUIDE.md').includes('latest.yml') && read('RELEASE_GUIDE.md').includes('.blockmap'));
if (process.exitCode) process.exit(1);
console.log(`NightVault ${version} release preflight passed.`);
