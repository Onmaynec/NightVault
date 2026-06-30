"use strict";

const fs = require("fs");
const path = require("path");
const config = require("./config");
const { runMigrations } = require("./migrations");
const { randomId, sha256, sanitizeFilename } = require("./security");
const { normalizePrivacy } = require("../services/privacy");
const { migrateContacts } = require("../services/contacts");

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (error) {
  console.error(JSON.stringify({ level: "error", event: "sqlite_unavailable", message: error.message }));
}

function emptyDatabase() {
  return {
    schemaVersion: 13,
    users: {},
    sessions: {},
    chats: {},
    messages: {},
    blocks: {},
    reputation: {},
    deletedChats: {},
    hiddenChats: {},
    files: {},
    securityEvents: [],
    contacts: {},
    clientReports: [],
    syncEvents: [],
    notes: {},
    links: {},
    syncQueue: {},
    syncCursors: {},
    syncIdempotency: {},
    tombstones: [],
    syncConflicts: [],
    trustedDevices: {},
    keyEvents: [],
    adminTestRuns: [],
    notifications: [],
    presence: {},
    groupAudit: [],
    inviteLinks: {},
    mediaRefs: {},
    featureFlags: { sqliteReady: Boolean(DatabaseSync), e2eeReady: true, syncEngineReady: true },
  };
}

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

let sqlite = null;
function openSqlite() {
  if (!DatabaseSync) return null;
  if (sqlite) return sqlite;
  sqlite = new DatabaseSync(config.sqliteFile);
  const migrationResult = runMigrations(sqlite, config);
  if (migrationResult.applied) console.log(JSON.stringify({ level: "info", event: "sqlite_migrations", ...migrationResult }));
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (access_hash TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (chat_id TEXT NOT NULL, message_id TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(chat_id, message_id));
    CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contacts (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS blocks (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reputation (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS deleted_chats (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS hidden_chats (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS security_events (id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS client_reports (id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_events (id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notes (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS links (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_queue (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_cursors (username TEXT NOT NULL, device_id TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY(username, device_id));
    CREATE TABLE IF NOT EXISTS sync_idempotency (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tombstones (entity TEXT NOT NULL, entity_id TEXT NOT NULL, chat_id TEXT NOT NULL DEFAULT '', deleted_by TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER NOT NULL, PRIMARY KEY(entity, entity_id));
    CREATE TABLE IF NOT EXISTS sync_conflicts (id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, local_version INTEGER NOT NULL, remote_version INTEGER NOT NULL, resolution TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trusted_devices (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS key_events (id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_test_runs (id TEXT PRIMARY KEY, name TEXT NOT NULL, passed INTEGER NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, username TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL, read_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS presence (username TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS group_audit (id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invite_links (code TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS media_refs (file_id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `);
  return sqlite;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
function stringify(value) {
  return JSON.stringify(value == null ? null : value);
}
function readRowsMap(table, keyColumn = "id") {
  const db = openSqlite();
  if (!db) return {};
  const rows = db.prepare(`SELECT ${keyColumn} AS key, value FROM ${table}`).all();
  const output = {};
  for (const row of rows) output[row.key] = parseJson(row.value, {});
  return output;
}
function readEvents(table, max = 1000) {
  const db = openSqlite();
  if (!db) return [];
  return db.prepare(`SELECT value FROM ${table} ORDER BY created_at ASC LIMIT ?`).all(max).map((row) => parseJson(row.value, null)).filter(Boolean);
}
function readMessages() {
  const db = openSqlite();
  if (!db) return {};
  const rows = db.prepare("SELECT chat_id, value FROM messages ORDER BY created_at ASC").all();
  const output = {};
  for (const row of rows) {
    output[row.chat_id] = output[row.chat_id] || [];
    output[row.chat_id].push(parseJson(row.value, {}));
  }
  return output;
}


function readSyncCursors() {
  const database = openSqlite();
  if (!database) return {};
  try {
    const rows = database.prepare("SELECT username, device_id, cursor, updated_at FROM sync_cursors").all();
    const output = {};
    for (const row of rows) output[`${row.username}:${row.device_id}`] = { username: row.username, deviceId: row.device_id, cursor: Number(row.cursor || 0), updatedAt: Number(row.updated_at || 0) };
    return output;
  } catch { return {}; }
}

function readSyncIdempotency() {
  const database = openSqlite();
  if (!database) return {};
  try {
    const rows = database.prepare("SELECT username, idempotency_key, event_id, result, created_at FROM sync_idempotency ORDER BY created_at ASC LIMIT 10000").all();
    const output = {};
    for (const row of rows) {
      output[row.username] = output[row.username] || {};
      output[row.username][row.idempotency_key] = { eventId: row.event_id, result: parseJson(row.result, {}), createdAt: Number(row.created_at || 0) };
    }
    return output;
  } catch { return {}; }
}
function readTrustedDevices() {
  const database = openSqlite();
  if (!database) return {};
  try {
    const rows = database.prepare("SELECT username, device_id, trusted, fingerprint, confirmed_at FROM trusted_devices").all();
    const output = {};
    for (const row of rows) {
      output[row.username] = output[row.username] || {};
      output[row.username][row.device_id] = { deviceId: row.device_id, trusted: Boolean(row.trusted), fingerprint: row.fingerprint || "", confirmedAt: Number(row.confirmed_at || 0) };
    }
    return output;
  } catch { return {}; }
}

function readTombstones() {
  const database = openSqlite();
  if (!database) return [];
  try { return database.prepare("SELECT entity, entity_id AS entityId, chat_id AS chatId, deleted_by AS deletedBy, version, deleted_at AS deletedAt FROM tombstones ORDER BY deleted_at ASC LIMIT 3000").all(); }
  catch { return []; }
}
function readSyncConflicts() {
  const database = openSqlite();
  if (!database) return [];
  try { return database.prepare("SELECT id, entity, entity_id AS entityId, local_version AS localVersion, remote_version AS remoteVersion, resolution, value, created_at AS createdAt FROM sync_conflicts ORDER BY created_at ASC LIMIT 1200").all().map((row) => ({ ...row, value: parseJson(row.value, {}) })); }
  catch { return []; }
}
function readAdminTestRuns() {
  const database = openSqlite();
  if (!database) return [];
  try { return database.prepare("SELECT id, name, passed, value, created_at AS createdAt FROM admin_test_runs ORDER BY created_at ASC LIMIT 500").all().map((row) => ({ id: row.id, name: row.name, passed: Boolean(row.passed), value: parseJson(row.value, {}), createdAt: row.createdAt })); }
  catch { return []; }
}
function readNotifications() {
  const database = openSqlite();
  if (!database) return [];
  try { return database.prepare("SELECT id, username, type, value, read_at AS readAt, created_at AS createdAt FROM notifications ORDER BY created_at ASC LIMIT 3000").all().map((row) => ({ ...row, value: parseJson(row.value, {}) })); }
  catch { return []; }
}


function readKeyEvents() {
  const database = openSqlite();
  if (!database) return [];
  try { return database.prepare("SELECT id, username, device_id AS deviceId, type, value, created_at AS createdAt FROM key_events ORDER BY created_at ASC LIMIT 1200").all().map((row) => ({ ...row, value: parseJson(row.value, {}) })); }
  catch { return []; }
}
function readPresence() {
  const database = openSqlite();
  if (!database) return {};
  try {
    const rows = database.prepare("SELECT username, mode, last_seen_at AS lastSeenAt, value FROM presence").all();
    const output = {};
    for (const row of rows) output[row.username] = { ...parseJson(row.value, {}), mode: row.mode || "online", lastSeenAt: Number(row.lastSeenAt || 0) };
    return output;
  } catch { return {}; }
}
function readGroupAudit() {
  const database = openSqlite();
  if (!database) return [];
  try { return database.prepare("SELECT id, chat_id AS chatId, actor, action, value, created_at AS createdAt FROM group_audit ORDER BY created_at ASC LIMIT 1200").all().map((row) => ({ ...row, value: parseJson(row.value, {}) })); }
  catch { return []; }
}
function readInviteLinks() {
  const database = openSqlite();
  if (!database) return {};
  try {
    const rows = database.prepare("SELECT code, chat_id AS chatId, created_by AS createdBy, expires_at AS expiresAt, max_uses AS maxUses, uses, value, created_at AS createdAt FROM invite_links").all();
    const output = {};
    for (const row of rows) output[row.code] = { ...parseJson(row.value, {}), code: row.code, chatId: row.chatId, createdBy: row.createdBy, expiresAt: Number(row.expiresAt || 0), maxUses: Number(row.maxUses || 0), uses: Number(row.uses || 0), createdAt: Number(row.createdAt || 0) };
    return output;
  } catch { return {}; }
}

function readDatabase() {
  const db = openSqlite();
  const output = emptyDatabase();
  if (!db) return output;
  const metaRows = db.prepare("SELECT key, value FROM meta").all();
  for (const row of metaRows) {
    if (row.key === "schemaVersion") output.schemaVersion = Number(row.value) || output.schemaVersion;
    if (row.key === "featureFlags") output.featureFlags = { ...output.featureFlags, ...parseJson(row.value, {}) };
  }
  output.users = readRowsMap("users", "username");
  output.sessions = readRowsMap("sessions", "access_hash");
  output.chats = readRowsMap("chats", "id");
  output.messages = readMessages();
  output.files = readRowsMap("files", "id");
  output.contacts = readRowsMap("contacts", "username");
  output.blocks = readRowsMap("blocks", "username");
  output.reputation = readRowsMap("reputation", "username");
  output.deletedChats = readRowsMap("deleted_chats", "username");
  output.hiddenChats = readRowsMap("hidden_chats", "username");
  output.securityEvents = readEvents("security_events", 1200);
  output.clientReports = readEvents("client_reports", 240);
  output.syncEvents = readEvents("sync_events", 2500);
  output.notes = readRowsMap("notes", "username");
  output.links = readRowsMap("links", "username");
  output.syncQueue = readRowsMap("sync_queue", "username");
  output.syncCursors = readSyncCursors();
  output.syncIdempotency = readSyncIdempotency();
  output.tombstones = readTombstones();
  output.syncConflicts = readSyncConflicts();
  output.trustedDevices = readTrustedDevices();
  output.keyEvents = readKeyEvents();
  output.adminTestRuns = readAdminTestRuns();
  output.notifications = readNotifications();
  output.presence = readPresence();
  output.groupAudit = readGroupAudit();
  output.inviteLinks = readInviteLinks();
  output.mediaRefs = readRowsMap("media_refs", "file_id");
  output.featureFlags = { ...output.featureFlags, sqliteReady: true, e2eeReady: true, syncEngineReady: true };
  return output;
}

const db = readDatabase();

function migrateSessions() {
  const migrated = {};
  const timestamp = Date.now();
  for (const [key, value] of Object.entries(db.sessions || {})) {
    const accessHash = /^[a-f0-9]{64}$/i.test(key) ? key : sha256(key);
    migrated[accessHash] = {
      id: value.id || randomId(8),
      username: value.username,
      createdAt: value.createdAt || timestamp,
      lastUsedAt: value.lastUsedAt || value.createdAt || timestamp,
      accessExpiresAt: value.accessExpiresAt || timestamp + 24 * 60 * 60 * 1000,
      refreshHash: value.refreshHash || "",
      refreshExpiresAt: value.refreshExpiresAt || timestamp + 24 * 60 * 60 * 1000,
      device: String(value.device || "Unknown device").slice(0, 240),
      ip: String(value.ip || "").slice(0, 80),
    };
  }
  db.sessions = migrated;
}

function migrateUsers() {
  for (const user of Object.values(db.users || {})) {
    user.settings = user.settings || {};
    delete user.settings.pin;
    delete user.settings.startPass;
    if (user.settings.twofa) {
      user.legacyTwoFactorRemovedAt = Date.now();
      delete user.settings.twofa;
    }
    user.twoFactor = user.twoFactor || null;
    user.privacy = normalizePrivacy(user.privacy || {});
    user.displayName = String(user.displayName || user.username).slice(0, 64);
    user.bio = String(user.bio || "").slice(0, 800);
    user.e2eeDevices = user.e2eeDevices && typeof user.e2eeDevices === "object" ? user.e2eeDevices : {};
  }
}

function migrateLegacyFile(url, owner, chatId, kind = "attachment", attachment = null) {
  const match = String(url || "").match(/\/uploads\/([^?#]+)/);
  if (!match) return url;
  const legacyName = decodeURIComponent(match[1]);
  const source = path.join(config.legacyUploadsDir, path.basename(legacyName));
  if (!fs.existsSync(source)) return "";
  const fileId = randomId(18);
  const target = path.join(config.uploadsDir, fileId);
  try {
    fs.copyFileSync(source, target);
    const stat = fs.statSync(target);
    db.files[fileId] = {
      id: fileId,
      owner,
      chatId: chatId || null,
      kind,
      originalName: sanitizeFilename(attachment?.name || legacyName),
      mime: String(attachment?.type || "application/octet-stream").slice(0, 120),
      size: stat.size,
      createdAt: Date.now(),
    };
    return `/api/files/${fileId}`;
  } catch {
    return "";
  }
}

function migrateFiles() {
  for (const [username, user] of Object.entries(db.users || {})) {
    if (user.avatar && !String(user.avatar).startsWith("/api/files/")) user.avatar = migrateLegacyFile(user.avatar, username, null, "avatar");
    if (user.banner && !String(user.banner).startsWith("/api/files/")) user.banner = migrateLegacyFile(user.banner, username, null, "banner");
  }
  for (const [chatId, messages] of Object.entries(db.messages || {})) {
    for (const message of messages || []) {
      if (message.attachment?.url && !String(message.attachment.url).startsWith("/api/files/")) {
        const migrated = migrateLegacyFile(message.attachment.url, message.from, chatId, "attachment", message.attachment);
        if (migrated) {
          const fileId = migrated.split("/").pop();
          message.attachment = { ...message.attachment, id: fileId, url: migrated };
        }
      }
    }
  }
}

function migrate() {
  migrateSessions();
  migrateUsers();
  migrateFiles();
  db.securityEvents = Array.isArray(db.securityEvents) ? db.securityEvents : [];
  migrateContacts(db);
  db.clientReports = Array.isArray(db.clientReports) ? db.clientReports.slice(-240) : [];
  db.syncEvents = Array.isArray(db.syncEvents) ? db.syncEvents.slice(-2500) : [];
  db.notes = db.notes && typeof db.notes === "object" ? db.notes : {};
  db.links = db.links && typeof db.links === "object" ? db.links : {};
  db.syncQueue = db.syncQueue && typeof db.syncQueue === "object" ? db.syncQueue : {};
  db.syncCursors = db.syncCursors && typeof db.syncCursors === "object" ? db.syncCursors : {};
  db.syncIdempotency = db.syncIdempotency && typeof db.syncIdempotency === "object" ? db.syncIdempotency : {};
  db.tombstones = Array.isArray(db.tombstones) ? db.tombstones.slice(-3000) : [];
  db.syncConflicts = Array.isArray(db.syncConflicts) ? db.syncConflicts.slice(-1200) : [];
  db.trustedDevices = db.trustedDevices && typeof db.trustedDevices === "object" ? db.trustedDevices : {};
  db.keyEvents = Array.isArray(db.keyEvents) ? db.keyEvents.slice(-1200) : [];
  db.adminTestRuns = Array.isArray(db.adminTestRuns) ? db.adminTestRuns.slice(-500) : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications.slice(-3000) : [];
  db.presence = db.presence && typeof db.presence === "object" ? db.presence : {};
  db.groupAudit = Array.isArray(db.groupAudit) ? db.groupAudit.slice(-1200) : [];
  db.inviteLinks = db.inviteLinks && typeof db.inviteLinks === "object" ? db.inviteLinks : {};
  db.mediaRefs = db.mediaRefs && typeof db.mediaRefs === "object" ? db.mediaRefs : {};
  db.featureFlags = { ...(db.featureFlags || {}), sqliteReady: Boolean(DatabaseSync), e2eeReady: true, syncEngineReady: true };
  db.schemaVersion = 13;
}

migrate();

let writeChain = Promise.resolve();
let writeNowRunning = false;
let dirty = false;
let timer = null;

function upsertMap(tx, table, keyColumn, values) {
  tx.exec(`DELETE FROM ${table}`);
  const statement = tx.prepare(`INSERT INTO ${table} (${keyColumn}, value, updated_at) VALUES (?, ?, ?)`);
  const timestamp = Date.now();
  for (const [key, value] of Object.entries(values || {})) statement.run(key, stringify(value), timestamp);
}

function writeEvents(tx, table, values, max) {
  tx.exec(`DELETE FROM ${table}`);
  const statement = tx.prepare(`INSERT INTO ${table} (id, value, created_at) VALUES (?, ?, ?)`);
  const list = (Array.isArray(values) ? values : []).slice(-max);
  for (const item of list) statement.run(String(item.id || randomId(10)), stringify(item), Number(item.createdAt || item.time || Date.now()));
}

function writeMessages(tx) {
  tx.exec("DELETE FROM messages");
  const statement = tx.prepare("INSERT INTO messages (chat_id, message_id, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  const timestamp = Date.now();
  for (const [chatId, messages] of Object.entries(db.messages || {})) {
    for (const message of messages || []) {
      const id = String(message.id || randomId(12));
      message.id = id;
      statement.run(chatId, id, stringify(message), Number(message.createdAt || timestamp), timestamp);
    }
  }
}



function writeSyncEventsV2(tx) {
  try { tx.exec("DELETE FROM sync_events_v2"); } catch { return; }
  const statement = tx.prepare("INSERT OR REPLACE INTO sync_events_v2 (event_id, client_id, username, device_id, entity, entity_id, operation, version, idempotency_key, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const event of (db.syncEvents || []).slice(-5000)) {
    statement.run(
      String(event.eventId || event.id || randomId(10)),
      String(event.clientId || "server"),
      String(event.username || "server"),
      String(event.deviceId || "server"),
      String(event.entity || "event"),
      String(event.entityId || ""),
      String(event.operation || event.type || "update"),
      Number(event.version || 1),
      String(event.idempotencyKey || event.id || ""),
      stringify(event.payload || event),
      Number(event.createdAt || Date.now()),
    );
  }
}

function writeSyncCursors(tx) {
  tx.exec("DELETE FROM sync_cursors");
  const statement = tx.prepare("INSERT OR REPLACE INTO sync_cursors (username, device_id, cursor, updated_at) VALUES (?, ?, ?, ?)");
  for (const item of Object.values(db.syncCursors || {})) statement.run(item.username || "", item.deviceId || item.device_id || "default", Number(item.cursor || 0), Number(item.updatedAt || item.updated_at || Date.now()));
}

function writeSyncIdempotency(tx) {
  tx.exec("DELETE FROM sync_idempotency");
  const statement = tx.prepare("INSERT OR REPLACE INTO sync_idempotency (username, idempotency_key, event_id, result, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const [username, values] of Object.entries(db.syncIdempotency || {})) {
    for (const [key, item] of Object.entries(values || {})) statement.run(username, key, String(item.eventId || ""), stringify(item.result || {}), Number(item.createdAt || Date.now()));
  }
}
function writeTrustedDevices(tx) {
  tx.exec("DELETE FROM trusted_devices");
  const statement = tx.prepare("INSERT OR REPLACE INTO trusted_devices (username, device_id, trusted, fingerprint, confirmed_at) VALUES (?, ?, ?, ?, ?)");
  for (const [username, values] of Object.entries(db.trustedDevices || {})) {
    for (const [deviceId, item] of Object.entries(values || {})) statement.run(username, deviceId, item.trusted ? 1 : 0, String(item.fingerprint || ""), Number(item.confirmedAt || Date.now()));
  }
}

function writeTombstones(tx) {
  tx.exec("DELETE FROM tombstones");
  const statement = tx.prepare("INSERT OR REPLACE INTO tombstones (entity, entity_id, chat_id, deleted_by, version, deleted_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const item of (db.tombstones || []).slice(-3000)) statement.run(String(item.entity || ""), String(item.entityId || item.entity_id || ""), String(item.chatId || item.chat_id || ""), String(item.deletedBy || item.deleted_by || ""), Number(item.version || 1), Number(item.deletedAt || item.deleted_at || Date.now()));
}
function writeSyncConflicts(tx) {
  tx.exec("DELETE FROM sync_conflicts");
  const statement = tx.prepare("INSERT OR REPLACE INTO sync_conflicts (id, entity, entity_id, local_version, remote_version, resolution, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const item of (db.syncConflicts || []).slice(-1200)) statement.run(String(item.id || randomId(10)), String(item.entity || ""), String(item.entityId || item.entity_id || ""), Number(item.localVersion || item.local_version || 0), Number(item.remoteVersion || item.remote_version || 0), String(item.resolution || "last-write-wins"), stringify(item.value || item), Number(item.createdAt || item.created_at || Date.now()));
}
function writeAdminTestRuns(tx) {
  tx.exec("DELETE FROM admin_test_runs");
  const statement = tx.prepare("INSERT OR REPLACE INTO admin_test_runs (id, name, passed, value, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const item of (db.adminTestRuns || []).slice(-500)) statement.run(String(item.id || randomId(10)), String(item.name || "test"), item.passed ? 1 : 0, stringify(item.value || item), Number(item.createdAt || item.created_at || Date.now()));
}
function writeNotifications(tx) {
  tx.exec("DELETE FROM notifications");
  const statement = tx.prepare("INSERT OR REPLACE INTO notifications (id, username, type, value, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const item of (db.notifications || []).slice(-3000)) statement.run(String(item.id || randomId(10)), String(item.username || ""), String(item.type || "info"), stringify(item.value || {}), Number(item.readAt || item.read_at || 0), Number(item.createdAt || item.created_at || Date.now()));
}

function writeKeyEvents(tx) {
  tx.exec("DELETE FROM key_events");
  const statement = tx.prepare("INSERT OR REPLACE INTO key_events (id, username, device_id, type, value, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const item of (db.keyEvents || []).slice(-1200)) statement.run(String(item.id || randomId(10)), String(item.username || ""), String(item.deviceId || item.device_id || ""), String(item.type || "event"), stringify(item.value || item), Number(item.createdAt || item.created_at || Date.now()));
}
function writePresence(tx) {
  tx.exec("DELETE FROM presence");
  const statement = tx.prepare("INSERT OR REPLACE INTO presence (username, mode, last_seen_at, value) VALUES (?, ?, ?, ?)");
  for (const [username, item] of Object.entries(db.presence || {})) statement.run(username, String(item.mode || "online"), Number(item.lastSeenAt || item.last_seen_at || Date.now()), stringify(item));
}
function writeGroupAudit(tx) {
  tx.exec("DELETE FROM group_audit");
  const statement = tx.prepare("INSERT OR REPLACE INTO group_audit (id, chat_id, actor, action, value, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const item of (db.groupAudit || []).slice(-1200)) statement.run(String(item.id || randomId(10)), String(item.chatId || item.chat_id || ""), String(item.actor || ""), String(item.action || "event"), stringify(item.value || item), Number(item.createdAt || item.created_at || Date.now()));
}
function writeInviteLinks(tx) {
  tx.exec("DELETE FROM invite_links");
  const statement = tx.prepare("INSERT OR REPLACE INTO invite_links (code, chat_id, created_by, expires_at, max_uses, uses, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const [code, item] of Object.entries(db.inviteLinks || {})) statement.run(code, String(item.chatId || item.chat_id || ""), String(item.createdBy || item.created_by || ""), Number(item.expiresAt || item.expires_at || 0), Number(item.maxUses || item.max_uses || 0), Number(item.uses || 0), stringify(item), Number(item.createdAt || item.created_at || Date.now()));
}

function writeNormalizedProjections(tx) {
  try {
    tx.exec("DELETE FROM chat_members; DELETE FROM devices; DELETE FROM message_reactions; DELETE FROM message_reads; DELETE FROM message_attachments; DELETE FROM file_refs; DELETE FROM search_fts");
  } catch {}
  const memberStmt = tx.prepare("INSERT OR IGNORE INTO chat_members (chat_id, username, role, joined_at) VALUES (?, ?, ?, ?)");
  const deviceStmt = tx.prepare("INSERT OR REPLACE INTO devices (username, device_id, trusted, fingerprint, public_key, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)");
  const reactionStmt = tx.prepare("INSERT OR IGNORE INTO message_reactions (message_id, username, reaction, created_at) VALUES (?, ?, ?, ?)");
  const readStmt = tx.prepare("INSERT OR IGNORE INTO message_reads (message_id, username, state, at) VALUES (?, ?, ?, ?)");
  const attachmentStmt = tx.prepare("INSERT OR REPLACE INTO message_attachments (message_id, file_id, name, mime, size) VALUES (?, ?, ?, ?, ?)");
  const refStmt = tx.prepare("INSERT OR REPLACE INTO file_refs (file_id, owner, entity, entity_id, created_at) VALUES (?, ?, ?, ?, ?)");
  let ftsStmt = null;
  try { ftsStmt = tx.prepare("INSERT INTO search_fts (scope, owner, entity_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)"); } catch {}
  for (const chat of Object.values(db.chats || {})) {
    for (const username of chat.members || []) memberStmt.run(chat.id, username, chat.owner === username ? "owner" : (chat.admins || []).includes(username) ? "admin" : "member", Number(chat.createdAt || 0));
  }
  for (const [username, user] of Object.entries(db.users || {})) {
    for (const device of Object.values(user.e2eeDevices || {})) deviceStmt.run(username, device.id, db.trustedDevices?.[username]?.[device.id]?.trusted ? 1 : 0, db.trustedDevices?.[username]?.[device.id]?.fingerprint || "", stringify(device.publicKey || {}), Number(device.lastSeenAt || 0));
  }
  for (const [chatId, messages] of Object.entries(db.messages || {})) for (const message of messages || []) {
    for (const [reaction, users] of Object.entries(message.reactions || {})) for (const username of users || []) reactionStmt.run(message.id, username, reaction, Number(message.createdAt || Date.now()));
    for (const username of message.deliveredTo || []) readStmt.run(message.id, username, "delivered", Number(message.createdAt || Date.now()));
    for (const username of message.readBy || []) readStmt.run(message.id, username, "read", Number(message.createdAt || Date.now()));
    const attachment = message.decryptedAttachment || message.attachment;
    if (attachment?.id) { attachmentStmt.run(message.id, attachment.id, String(attachment.name || ""), String(attachment.type || ""), Number(attachment.size || 0)); refStmt.run(attachment.id, message.from || "", "message", message.id, Number(message.createdAt || Date.now())); }
    try { ftsStmt?.run("message", (db.chats?.[chatId]?.members || []).join(","), message.id, db.chats?.[chatId]?.title || chatId, String(message.text || message.attachment?.name || "").slice(0, 10000), Number(message.createdAt || 0)); } catch {}
  }
  for (const [username, notes] of Object.entries(db.notes || {})) for (const note of notes || []) try { ftsStmt?.run("note", username, note.id, String(note.title || ""), String(note.body || ""), Number(note.createdAt || note.updatedAt || 0)); } catch {}
  for (const [username, links] of Object.entries(db.links || {})) for (const link of links || []) try { ftsStmt?.run("link", username, link.id, String(link.title || ""), String(link.url || ""), Number(link.createdAt || link.updatedAt || 0)); } catch {}
}

async function writeNow() {
  if (writeNowRunning) {
    writeChain = writeChain.then(writeNow, writeNow);
    return writeChain;
  }
  writeNowRunning = true;
  dirty = false;
  const database = openSqlite();
  if (!database) { writeNowRunning = false; return; }
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("schemaVersion", String(db.schemaVersion || 13));
    database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("featureFlags", stringify(db.featureFlags || {}));
    upsertMap(database, "users", "username", db.users);
    upsertMap(database, "sessions", "access_hash", db.sessions);
    upsertMap(database, "chats", "id", db.chats);
    writeMessages(database);
    upsertMap(database, "files", "id", db.files);
    upsertMap(database, "contacts", "username", db.contacts);
    upsertMap(database, "blocks", "username", db.blocks);
    upsertMap(database, "reputation", "username", db.reputation);
    upsertMap(database, "deleted_chats", "username", db.deletedChats);
    upsertMap(database, "hidden_chats", "username", db.hiddenChats);
    writeEvents(database, "security_events", db.securityEvents, 1200);
    writeEvents(database, "client_reports", db.clientReports, 240);
    writeEvents(database, "sync_events", db.syncEvents, 5000);
    writeSyncEventsV2(database);
    upsertMap(database, "notes", "username", db.notes);
    upsertMap(database, "links", "username", db.links);
    upsertMap(database, "sync_queue", "username", db.syncQueue);
    writeSyncCursors(database);
    writeSyncIdempotency(database);
    writeTombstones(database);
    writeSyncConflicts(database);
    writeTrustedDevices(database);
    writeKeyEvents(database);
    writeAdminTestRuns(database);
    writeNotifications(database);
    writePresence(database);
    writeGroupAudit(database);
    writeInviteLinks(database);
    upsertMap(database, "media_refs", "file_id", db.mediaRefs);
    writeNormalizedProjections(database);
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    writeNowRunning = false;
  }
}

function save({ immediate = false } = {}) {
  dirty = true;
  if (immediate) {
    if (timer) clearTimeout(timer);
    timer = null;
    writeChain = writeChain.then(writeNow, writeNow);
    return writeChain;
  }
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      if (!dirty) return;
      writeChain = writeChain.then(writeNow, writeNow);
    }, 40);
    timer.unref?.();
  }
  return writeChain;
}

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (dirty) writeChain = writeChain.then(writeNow, writeNow);
  await writeChain;
}

function sqliteStatus() {
  const database = openSqlite();
  if (!database) return { ok: false, file: config.sqliteFile, message: "node:sqlite недоступен" };
  const integrity = database.prepare("PRAGMA integrity_check").get();
  const pageCount = database.prepare("PRAGMA page_count").get();
  const pageSize = database.prepare("PRAGMA page_size").get();
  const migrations = database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get();
  return {
    schemaVersion: db.schemaVersion || 13,
    migrations: Number(migrations.count || 0),
    ok: String(integrity.integrity_check || integrity[0] || "ok") === "ok",
    file: config.sqliteFile,
    integrity: integrity.integrity_check || integrity[0] || "ok",
    sizeBytes: Number(pageCount.page_count || 0) * Number(pageSize.page_size || 0),
  };
}

function listTables() {
  const database = openSqlite();
  if (!database) return [];
  return database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
}

function previewCell(value, max = 1800) {
  if (value == null) return value;
  let text = typeof value === "string" ? value : stringify(value);
  if (text.length > max) text = text.slice(0, max) + "…";
  return text;
}

function readTable(table, limit = 200) {
  const database = openSqlite();
  if (!database) return [];
  const allowed = new Set(listTables());
  if (!allowed.has(table)) throw new Error("Недопустимая таблица");
  const safeLimit = Math.max(1, Math.min(table === "reputation" ? 50 : 500, Number(limit) || 120));
  const rows = database.prepare(`SELECT * FROM ${table} LIMIT ?`).all(safeLimit);
  return rows.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row || {})) out[key] = previewCell(value, table === "reputation" ? 900 : 1800);
    return out;
  });
}

save({ immediate: true }).catch((error) => {
  console.error(JSON.stringify({ level: "error", event: "sqlite_initial_save", message: error.message }));
});

module.exports = { db, save, flush, sqliteStatus, listTables, readTable, openSqlite };
