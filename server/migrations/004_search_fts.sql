CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(scope, owner, entity_id, title, body, created_at UNINDEXED);
