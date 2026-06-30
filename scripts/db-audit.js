#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}
function ok(name, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} db-audit: ${name}${detail ? " — " + detail : ""}`);
  if (!pass) process.exitCode = 1;
}

const pkg = require("../package.json");
const config = require("../server/lib/config");
const store = read("server/lib/store.js");
const migrationPath = path.join(root, "server", "migrations", "014_145_schema_alignment.sql");
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const requiredTables = [
  "sync_idempotency",
  "trusted_devices",
  "key_events",
  "presence",
  "group_audit",
  "invite_links",
  "media_refs",
];

ok("package version is 1.4.5", pkg.version === "1.4.5", pkg.version);
ok("dataDir is absolute", path.isAbsolute(config.dataDir), config.dataDir);
ok("uploadsDir is absolute", path.isAbsolute(config.uploadsDir), config.uploadsDir);
ok("max upload envelope is at least video limit", config.maxFileBytes >= config.maxVideoBytes, `${config.maxFileBytes}/${config.maxVideoBytes}`);
ok("migration 014 exists", Boolean(migration), "server/migrations/014_145_schema_alignment.sql");
for (const table of requiredTables) {
  ok(`migration creates ${table}`, migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}
ok("store opens sqlite before fallback tables", store.includes("runMigrations(sqlite, config)") && store.indexOf("runMigrations(sqlite, config)") < store.indexOf("CREATE TABLE IF NOT EXISTS meta"));
ok("store reads richer sync idempotency columns", store.includes("idempotency_key") && store.includes("readSyncIdempotency"));
ok("store reads trusted device columns", store.includes("device_id") && store.includes("readTrustedDevices"));

const runtimeDir = path.join(root, "server", "runtime");
const legacyJson = path.join(runtimeDir, "data.json");
const sqliteFile = path.join(runtimeDir, "nightvault.sqlite3");
if (fs.existsSync(legacyJson) && fs.existsSync(sqliteFile)) {
  console.warn("WARN db-audit: both legacy data.json and sqlite runtime DB exist — run readiness/private before release.");
}

if (process.exitCode) process.exit(1);
console.log("NightVault 1.4.5 DB audit passed.");
