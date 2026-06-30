-- NightVault 1.4.5 — fresh SQLite schema alignment.
-- These CREATE TABLE statements run before store.js fallback CREATE TABLE IF NOT EXISTS.
-- On a fresh database they guarantee that the richer readers in store.js have the columns they expect.

CREATE TABLE IF NOT EXISTS sync_idempotency (
  username TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_id TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(username, idempotency_key)
);

CREATE TABLE IF NOT EXISTS trusted_devices (
  username TEXT NOT NULL,
  device_id TEXT NOT NULL,
  trusted INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT NOT NULL DEFAULT '',
  confirmed_at INTEGER NOT NULL DEFAULT 0,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(username, device_id)
);

CREATE TABLE IF NOT EXISTS key_events (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS presence (
  username TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'online',
  last_seen_at INTEGER NOT NULL DEFAULT 0,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS group_audit (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invite_links (
  code TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  value TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media_refs (
  file_id TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);
