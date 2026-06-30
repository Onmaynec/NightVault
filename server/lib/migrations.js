"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function checksum(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function backupDatabaseBeforeMigrations(config) {
  try {
    if (!fs.existsSync(config.sqliteFile)) return "";
    const backupDir = path.join(config.dataDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(backupDir, `nightvault-before-migration-${stamp}.sqlite3`);
    fs.copyFileSync(config.sqliteFile, target);
    return target;
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", event: "migration_backup_failed", message: error.message }));
    return "";
  }
}

function readApplied(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL, checksum TEXT NOT NULL)");
  const rows = db.prepare("SELECT version, checksum FROM schema_migrations").all();
  return new Map(rows.map((row) => [Number(row.version), String(row.checksum || "")]));
}

function runMigrations(db, config) {
  const dir = path.join(config.rootDir, "server", "migrations");
  if (!fs.existsSync(dir)) return { applied: 0, backup: "", migrations: [] };
  const files = fs.readdirSync(dir).filter((name) => /^\d+_.+\.sql$/i.test(name)).sort();
  const applied = readApplied(db);
  let backup = "";
  const done = [];
  for (const file of files) {
    const version = Number(file.split("_")[0]);
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const hash = checksum(sql);
    if (applied.get(version) === hash) continue;
    if (!backup) backup = backupDatabaseBeforeMigrations(config);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT OR REPLACE INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)").run(version, file, Date.now(), hash);
      db.exec("COMMIT");
      done.push({ version, file, checksum: hash });
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      error.message = `Migration ${file} failed: ${error.message}`;
      throw error;
    }
  }
  return { applied: done.length, backup, migrations: done };
}

module.exports = { runMigrations, backupDatabaseBeforeMigrations, checksum };
