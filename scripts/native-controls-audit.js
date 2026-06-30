#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(name, pass, detail='') { console.log(`${pass ? 'OK' : 'FAIL'} native-controls-audit: ${name}${detail ? ' — ' + detail : ''}`); if (!pass) process.exitCode = 1; }
const css = read('src/style.css');
const adminCss = read('src/admin.css');
for (const [name, needle] of Object.entries({select:'select', option:'option', file:'file-selector-button', checkbox:'checkbox', range:'range', scrollbar:'::-webkit-scrollbar', textarea:'textarea', color:'input[type="color"]'})) {
  ok(`client ${name} styled`, css.includes(needle));
}
for (const [name, needle] of Object.entries({select:'select', option:'option', file:'file-selector-button', checkbox:'checkbox', range:'range', scrollbar:'::-webkit-scrollbar', textarea:'textarea', color:'input[type="color"]'})) {
  ok(`admin ${name} styled`, adminCss.includes(needle));
}
ok('final native controls cleanup marker', css.includes('Native Controls Final Cleanup') && adminCss.includes('Native Controls Final Cleanup'));
ok('theme-aware borders', css.includes('var(--border)') && adminCss.includes('var(--admin-soft-border)'));
if (process.exitCode) process.exit(1);
console.log('NightVault 1.4.3 native controls audit passed.');
