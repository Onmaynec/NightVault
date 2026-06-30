"use strict";

function normalizePresenceMode(value) {
  return ["online", "away", "invisible", "dnd"].includes(value) ? value : "online";
}

function setPresence(db, username, patch = {}) {
  db.presence = db.presence && typeof db.presence === "object" ? db.presence : {};
  db.presence[username] = { ...(db.presence[username] || {}), mode: normalizePresenceMode(patch.mode), lastSeenAt: Date.now(), statusText: String(patch.statusText || "").slice(0, 120) };
  return db.presence[username];
}

function presenceFor(db, sockets, username, viewer = "") {
  const record = db.presence?.[username] || { mode: "online", lastSeenAt: db.users?.[username]?.lastSeen || 0 };
  if (record.mode === "invisible" && viewer !== username) return { mode: "offline", online: false, lastSeenAt: 0 };
  return { mode: record.mode || "online", online: Boolean(sockets?.get?.(username)?.size) && record.mode !== "invisible", lastSeenAt: record.lastSeenAt || 0, statusText: record.statusText || "" };
}

module.exports = { normalizePresenceMode, setPresence, presenceFor };
