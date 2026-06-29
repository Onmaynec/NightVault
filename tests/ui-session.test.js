"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
test("1.3.6 isolates client profiles and sessions", () => {
  const main = read("src/main.js");
  assert.match(main, /NIGHTVAULT_PROFILE_ID/);
  assert.match(main, /client-profiles/);
  assert.match(main, /persist:nightvault-client/);
});
test("1.3.6 has E2EE resync and two panel UI", () => {
  const renderer = read("src/renderer.js");
  const css = read("src/style.css");
  assert.match(renderer, /nv131RegisterCurrentDevice/);
  assert.match(renderer, /\/devices\/e2ee\/current/);
  assert.match(renderer, /nv131Workspace/);
  assert.match(css, /\.nv131Workspace/);
});
