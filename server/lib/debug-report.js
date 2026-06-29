"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("./config");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }
function dosDateTime(date = new Date()) {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}
function writeZip(entries, target) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ""), "utf8");
    const crc = crc32(data);
    const dt = dosDateTime(entry.date || new Date());
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.day), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name]);
    local.push(header, data);
    const centralHeader = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.day), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    central.push(centralHeader);
    offset += header.length + data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralSize), u32(offset), u16(0)]);
  fs.writeFileSync(target, Buffer.concat([...local, ...central, end]));
  return target;
}
function safeJson(value) { return JSON.stringify(value, null, 2); }
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (/password|hash|token|secret|private|keyCiphertext|ciphertext|refresh/i.test(key)) out[key] = "[redacted]";
      else out[key] = redact(val);
    }
    return out;
  }
  return value;
}
function readText(file, max = 20000) {
  try { return fs.readFileSync(file, "utf8").slice(-max); } catch { return ""; }
}
function buildDebugReport({ db, sqliteStatus, readiness, serverStatus = {} } = {}) {
  const dir = path.join(config.dataDir, "debug-reports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `nightvault-debug-report-${stamp}.zip`);
  const appInfo = { app: "NightVault", version: config.version, node: process.version, platform: process.platform, arch: process.arch, cwd: process.cwd(), dataDir: config.dataDir, createdAt: Date.now() };
  const redactedState = redact({ users: db?.users || {}, chats: db?.chats || {}, files: db?.files || {}, featureFlags: db?.featureFlags || {}, schemaVersion: db?.schemaVersion });
  const entries = [
    { name: "app-info.json", data: safeJson(appInfo) },
    { name: "server-health.json", data: safeJson(serverStatus) },
    { name: "readiness.json", data: safeJson(readiness || {}) },
    { name: "sqlite-status.json", data: safeJson(sqliteStatus || {}) },
    { name: "recent-client-reports.json", data: safeJson(redact((db?.clientReports || []).slice(-30))) },
    { name: "recent-server-logs.txt", data: readText(path.join(config.dataDir, "server.log")) },
    { name: "recent-admin-logs.txt", data: readText(path.join(config.dataDir, "admin.log")) },
    { name: "sync-state.json", data: safeJson(redact({ cursors: db?.syncCursors || {}, events: (db?.syncEvents || []).slice(-50), conflicts: (db?.syncConflicts || []).slice(-50), tombstones: (db?.tombstones || []).slice(-50) })) },
    { name: "window-prefs.json", data: safeJson({ note: "stored in Electron userData on client machines" }) },
    { name: "redacted-local-state.json", data: safeJson(redactedState) },
  ];
  writeZip(entries, target);
  return { ok: true, path: target, entries: entries.map((entry) => entry.name), size: fs.statSync(target).size };
}

module.exports = { buildDebugReport, writeZip, redact };
