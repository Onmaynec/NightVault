CREATE TABLE IF NOT EXISTS sync_cursors (username TEXT NOT NULL, device_id TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY(username, device_id));
CREATE TABLE IF NOT EXISTS sync_idempotency (username TEXT NOT NULL, idempotency_key TEXT NOT NULL, event_id TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(username, idempotency_key));
CREATE INDEX IF NOT EXISTS idx_sync_idempotency_created ON sync_idempotency(created_at);
CREATE TABLE IF NOT EXISTS tombstones (entity TEXT NOT NULL, entity_id TEXT NOT NULL, chat_id TEXT NOT NULL DEFAULT '', deleted_by TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER NOT NULL, PRIMARY KEY(entity, entity_id));
CREATE INDEX IF NOT EXISTS idx_tombstones_created ON tombstones(deleted_at);
CREATE TABLE IF NOT EXISTS sync_conflicts (id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, local_version INTEGER NOT NULL, remote_version INTEGER NOT NULL, resolution TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sync_events_v2 (event_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, username TEXT NOT NULL, device_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL, version INTEGER NOT NULL, idempotency_key TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sync_events_v2_user_cursor ON sync_events_v2(username, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_events_v2_chat ON sync_events_v2(entity, entity_id, created_at);
