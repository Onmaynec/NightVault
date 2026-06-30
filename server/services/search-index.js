"use strict";

function strip(value) { return String(value || "").replace(/<[^>]*>/g, " ").slice(0, 10000); }

function rebuildSearchIndex(sqlite, db) {
  if (!sqlite) return { ok: false, reason: "sqlite_unavailable" };
  try { sqlite.exec("DELETE FROM search_fts"); } catch { return { ok: false, reason: "fts_unavailable" }; }
  const stmt = sqlite.prepare("INSERT INTO search_fts (scope, owner, entity_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  let count = 0;
  for (const [chatId, messages] of Object.entries(db.messages || {})) {
    const chat = db.chats?.[chatId];
    for (const msg of messages || []) {
      stmt.run("message", (chat?.members || []).join(","), msg.id, chat?.title || chatId, strip(msg.text || msg.decryptedText || msg.attachment?.name), Number(msg.createdAt || 0));
      count += 1;
    }
  }
  for (const [username, notes] of Object.entries(db.notes || {})) for (const note of notes || []) {
    stmt.run("note", username, note.id, strip(note.title), strip(note.body), Number(note.createdAt || note.updatedAt || 0));
    count += 1;
  }
  for (const [username, links] of Object.entries(db.links || {})) for (const link of links || []) {
    stmt.run("link", username, link.id, strip(link.title), strip(link.url), Number(link.createdAt || link.updatedAt || 0));
    count += 1;
  }
  return { ok: true, count };
}

function searchSqlite(sqlite, username, query, limit = 50) {
  const q = String(query || "").trim();
  if (q.length < 2 || !sqlite) return [];
  try {
    return sqlite.prepare("SELECT scope, owner, entity_id, title, snippet(search_fts, 4, '<mark>', '</mark>', '…', 12) AS snippet, created_at FROM search_fts WHERE search_fts MATCH ? AND (owner = ? OR owner LIKE ?) ORDER BY rank LIMIT ?")
      .all(q.replace(/["']/g, " "), username, `%${username}%`, Math.max(1, Math.min(200, Number(limit) || 50)));
  } catch {
    return [];
  }
}

module.exports = { rebuildSearchIndex, searchSqlite };
