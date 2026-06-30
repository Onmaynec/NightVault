"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
test('NightVault 1.4.3 has runtime tester quality gates', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.version, '1.4.3');
  assert.match(read('src/renderer.js'), /Real UI Runtime Check/);
  assert.match(read('src/client/ui-action-router.js'), /settings\.microphone\.test/);
  assert.match(read('src/client/ui/context-menu.js'), /NvContextMenu/);
  assert.match(read('scripts/native-controls-audit.js'), /file-selector-button/);
  assert.match(read('scripts/e2e-tester-flow.js'), /forward voice\/file to saved/);
});
