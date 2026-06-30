#!/usr/bin/env node
'use strict';
const fs = require('fs');
const checks = [
  ['client can route UI actions', fs.readFileSync('src/client/ui-action-router.js','utf8').includes('emoji.close')],
  ['client has E2EE recovery screen', fs.readFileSync('src/renderer.js','utf8').includes('nv142OpenE2eeRecovery')],
  ['client has microphone tester', fs.readFileSync('src/renderer.js','utf8').includes('nv142TestMicrophone')],
  ['admin has dry-run backup import', fs.readFileSync('src/main.js','utf8').includes('previewServerDataBundle')],
  ['context menu module can constrain menus', fs.readFileSync('src/client/ui/context-menu.js','utf8').includes('placeWithinViewport')],
  ['native controls visual cleanup present', fs.readFileSync('src/style.css','utf8').includes('nvNativeControl')],
];
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? 'ok' : 'fail'} e2e:real ${name}`); if(!pass) ok=false; }
if(!ok) process.exit(1);
console.log('e2e:real static Electron flow checks passed');
