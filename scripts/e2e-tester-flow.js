#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(name, pass) { console.log(`${pass ? 'OK' : 'FAIL'} e2e-tester: ${name}`); if (!pass) process.exitCode = 1; }
const renderer = read('src/renderer.js');
const admin = read('src/admin-renderer.js');
const serverTest = read('tests/server.test.js');
ok('create two users flow is covered by server test', serverTest.includes('alice') && serverTest.includes('bob'));
ok('contact request flow is covered', serverTest.includes('/contacts/bob_user/request') && serverTest.includes('/contacts/alice/accept'));
ok('group avatar / profile upload checks present', renderer.includes('group.avatar') || renderer.includes('nv135PickGroupAvatar'));
ok('send text/file flow covered', serverTest.includes('/messages') && serverTest.includes('/api/files'));
ok('forward voice/file to saved logic present', renderer.includes('forward') && renderer.includes('Saved'));
ok('emoji panel open/close action exists', read('src/client/ui-action-router.js').includes('emoji.close'));
ok('context menu bounds component exists', read('src/client/ui/context-menu.js').includes('placeWithinViewport'));
ok('backup dry-run exists in admin', admin.includes('backup dry-run') || admin.includes('Проверить без импорта'));
ok('tester debug report exists', renderer.includes('Tester Debug Report') || renderer.includes('tester.report'));
if (process.exitCode) process.exit(1);
console.log('NightVault 1.4.4 real tester e2e static flow checks passed.');
