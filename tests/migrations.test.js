"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("NightVault 1.3.0 ships migration manager and SQL migrations", () => {
  const manager = fs.readFileSync(path.join(root, "server/lib/migrations.js"), "utf8");
  assert.equal(manager.includes("schema_migrations"), true);
  const migrations = fs.readdirSync(path.join(root, "server/migrations")).filter((name) => name.endsWith(".sql"));
  assert.ok(migrations.includes("001_init.sql"));
  assert.ok(migrations.includes("003_sync_engine.sql"));
  assert.ok(migrations.includes("004_search_fts.sql"));
});

test("NightVault 1.3.0 has E2EE trust, debug zip, media and admin tests", () => {
  for (const rel of ["server/services/e2ee-trust.js", "server/lib/debug-report.js", "server/services/media-pipeline.js", "server/services/admin-tests.js"]) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
  }
  const server = fs.readFileSync(path.join(root, "server/server.js"), "utf8");
  assert.equal(server.includes("/api/chats/:id/e2ee-trust"), true);
  assert.equal(server.includes("/api/debug-report"), true);
  assert.equal(server.includes("/api/sync/history"), true);
});
