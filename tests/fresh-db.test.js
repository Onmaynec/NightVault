"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("NightVault 1.4.5 fresh database smoke script", { timeout: 60000 }, () => {
  const script = path.join(__dirname, "..", "scripts", "fresh-db-smoke.js");
  assert.equal(fs.existsSync(script), true);
  const result = spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    timeout: 55000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /fresh-db-smoke ok/);
});
