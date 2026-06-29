"use strict";

function createSyncEngine({ db, save, now = () => Date.now(), randomId = () => Math.random().toString(16).slice(2) }) {
  function ensure() {
    db.syncEvents = Array.isArray(db.syncEvents) ? db.syncEvents : [];
    db.syncQueue = db.syncQueue && typeof db.syncQueue === "object" ? db.syncQueue : {};
    db.syncCursors = db.syncCursors && typeof db.syncCursors === "object" ? db.syncCursors : {};
    db.syncIdempotency = db.syncIdempotency && typeof db.syncIdempotency === "object" ? db.syncIdempotency : {};
    db.tombstones = Array.isArray(db.tombstones) ? db.tombstones : [];
    db.syncConflicts = Array.isArray(db.syncConflicts) ? db.syncConflicts : [];
  }
  function cursorKey(username, deviceId) { return `${username}:${deviceId || "default"}`; }
  function eventId() { return `sync_${randomId(12)}`; }
  function safeSyncId(value, fallback = "") {
    const raw = String(value || "").slice(0, 120);
    if (["__proto__", "prototype", "constructor"].includes(raw)) return fallback;
    return /^[a-z0-9._:-]{0,120}$/i.test(raw) ? raw : fallback;
  }
  function normalize(input = {}, context = {}) {
    const timestamp = now();
    const entity = String(input.entity || input.type || "").toLowerCase().replace(/[^a-z_-]/g, "").slice(0, 40);
    const operation = String(input.operation || input.op || "upsert").toLowerCase();
    const entityId = safeSyncId(input.entityId || input.id || input.messageId || input.noteId || "", eventId());
    const clientId = safeSyncId(input.clientId || context.clientId || "client", "client");
    const deviceId = safeSyncId(input.deviceId || context.deviceId || "default", "default");
    const idempotencyKey = String(input.idempotencyKey || input.key || `${clientId}:${entity}:${entityId}:${operation}:${input.version || 1}`).slice(0, 220);
    return {
      id: String(input.eventId || input.id || eventId()).slice(0, 120),
      eventId: String(input.eventId || input.id || eventId()).slice(0, 120),
      clientId,
      username: context.username,
      deviceId,
      entity,
      entityId,
      chatId: safeSyncId(input.chatId || input.payload?.chatId || "", ""),
      operation: ["create", "update", "upsert", "delete", "tombstone", "patch"].includes(operation) ? operation : "upsert",
      version: Math.max(1, Number(input.version || input.payload?.version || 1) || 1),
      idempotencyKey,
      createdAt: Number(input.createdAt || timestamp),
      payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    };
  }
  function findMessage(entityId) {
    for (const [chatId, messages] of Object.entries(db.messages || {})) {
      const idx = (messages || []).findIndex((message) => message.id === entityId);
      if (idx >= 0) return { chatId, messages, idx, message: messages[idx] };
    }
    return null;
  }
  function conflict(local, incoming, entity, entityId) {
    const localVersion = Number(local?.version || 1);
    const remoteVersion = Number(incoming.version || 1);
    if (local && remoteVersion < localVersion) {
      db.syncConflicts.push({ id: eventId(), entity, entityId, localVersion, remoteVersion, resolution: "kept-local", value: { local, incoming }, createdAt: now() });
      return true;
    }
    return false;
  }
  function tombstone(ev) {
    const existing = db.tombstones.find((item) => item.entity === ev.entity && item.entityId === ev.entityId);
    const item = existing || { entity: ev.entity, entityId: ev.entityId };
    Object.assign(item, { chatId: ev.chatId || item.chatId || "", deletedBy: ev.username, version: ev.version, deletedAt: now() });
    if (!existing) db.tombstones.push(item);
    db.tombstones = db.tombstones.slice(-3000);
  }
  function apply(ev, options = {}) {
    ensure();
    if (!["message", "chat", "note", "link", "profile", "file"].includes(ev.entity)) return { applied: false, reason: "unsupported_entity" };
    if (["delete", "tombstone"].includes(ev.operation)) tombstone(ev);
    if (ev.entity === "message") {
      if (!ev.chatId || ["__proto__", "prototype", "constructor"].includes(ev.chatId)) return { applied: false, reason: "bad_chat_id" };
      const chat = db.chats?.[ev.chatId];
      if (!chat || !chat.members?.includes(ev.username)) return { applied: false, reason: "chat_denied" };
      db.messages[ev.chatId] = db.messages[ev.chatId] || [];
      const found = findMessage(ev.entityId);
      if (["delete", "tombstone"].includes(ev.operation)) {
        if (found) { found.message.deletedForAll = true; found.message.deletedAt = now(); found.message.version = Math.max(Number(found.message.version || 1), ev.version); }
        return { applied: true, tombstone: true };
      }
      const next = { id: ev.entityId, chatId: ev.chatId, from: ev.username, text: String(ev.payload.text || "").slice(0, 8000), attachment: ev.payload.attachment || null, e2ee: ev.payload.e2ee || null, reactions: ev.payload.reactions || {}, createdAt: Number(ev.payload.createdAt || ev.createdAt), version: ev.version, deliveredTo: [], readBy: [] };
      if (found) {
        if (conflict(found.message, ev, "message", ev.entityId)) return { applied: false, conflict: true };
        Object.assign(found.message, next, { editedAt: now() });
      } else db.messages[ev.chatId].push(next);
      return { applied: true };
    }
    if (ev.entity === "note") {
      db.notes[ev.username] = Array.isArray(db.notes[ev.username]) ? db.notes[ev.username] : [];
      const list = db.notes[ev.username];
      const idx = list.findIndex((item) => item.id === ev.entityId);
      if (["delete", "tombstone"].includes(ev.operation)) { if (idx >= 0) list.splice(idx, 1); return { applied: true, tombstone: true }; }
      const note = { id: ev.entityId, title: String(ev.payload.title || "Без названия").slice(0, 140), body: String(ev.payload.body || "").slice(0, 20000), pinned: Boolean(ev.payload.pinned), updatedAt: now(), version: ev.version };
      if (idx >= 0) { if (conflict(list[idx], ev, "note", ev.entityId)) return { applied: false, conflict: true }; list[idx] = { ...list[idx], ...note }; }
      else list.push({ ...note, createdAt: ev.createdAt });
      return { applied: true };
    }
    if (ev.entity === "link") {
      db.links[ev.username] = Array.isArray(db.links[ev.username]) ? db.links[ev.username] : [];
      const list = db.links[ev.username];
      const idx = list.findIndex((item) => item.id === ev.entityId);
      if (["delete", "tombstone"].includes(ev.operation)) { if (idx >= 0) list.splice(idx, 1); return { applied: true, tombstone: true }; }
      const link = { id: ev.entityId, url: String(ev.payload.url || "").slice(0, 1000), title: String(ev.payload.title || "").slice(0, 200), updatedAt: now(), version: ev.version };
      if (idx >= 0) list[idx] = { ...list[idx], ...link }; else list.push({ ...link, createdAt: ev.createdAt });
      return { applied: true };
    }
    if (ev.entity === "profile") {
      const user = db.users?.[ev.username];
      if (!user) return { applied: false, reason: "user_missing" };
      if (ev.payload.displayName !== undefined) user.displayName = String(ev.payload.displayName || user.username).slice(0, 64);
      if (ev.payload.bio !== undefined) user.bio = String(ev.payload.bio || "").slice(0, 800);
      user.version = Math.max(Number(user.version || 1), ev.version);
      return { applied: true };
    }
    return { applied: true };
  }
  async function pushEvents(rawItems = [], context = {}) {
    ensure();
    const accepted = [];
    const rejected = [];
    const events = [];
    const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 200);
    const userMap = db.syncIdempotency[context.username] || (db.syncIdempotency[context.username] = {});
    for (const raw of items) {
      const ev = normalize(raw, context);
      const previous = userMap[ev.idempotencyKey];
      if (previous) { accepted.push({ eventId: previous.eventId, clientId: ev.clientId, duplicate: true, status: "deduplicated" }); continue; }
      const result = apply(ev, context);
      const record = { ...ev, type: ev.operation, id: ev.eventId, payload: ev.payload, result, createdAt: Math.max(now(), ev.createdAt) };
      db.syncEvents.push(record);
      events.push(record);
      userMap[ev.idempotencyKey] = { eventId: ev.eventId, createdAt: now(), result };
      if (result.applied || result.tombstone) accepted.push({ eventId: ev.eventId, clientId: ev.clientId, status: result.tombstone ? "tombstoned" : "applied", result });
      else rejected.push({ eventId: ev.eventId, clientId: ev.clientId, status: "rejected", result, retryAfterMs: 1500 });
    }
    db.syncEvents = db.syncEvents.slice(-5000);
    await save({ immediate: true });
    return { ok: true, accepted, rejected, events, conflicts: db.syncConflicts.slice(-50), cursor: db.syncEvents.at(-1)?.createdAt || now(), serverTime: now() };
  }
  function pullEvents(context = {}, { cursor = 0, limit = 200 } = {}) {
    ensure();
    const allowedChats = new Set(Object.values(db.chats || {}).filter((chat) => chat.members?.includes(context.username)).map((chat) => chat.id));
    const events = db.syncEvents
      .filter((event) => Number(event.createdAt || 0) > Number(cursor || 0))
      .filter((event) => !event.chatId || allowedChats.has(event.chatId) || event.username === context.username || ["user", "profile"].includes(event.entity))
      .slice(0, Math.max(1, Math.min(500, Number(limit || 200))));
    const nextCursor = events.at(-1)?.createdAt || Number(cursor || 0);
    db.syncCursors[cursorKey(context.username, context.deviceId)] = { username: context.username, deviceId: context.deviceId || "default", cursor: nextCursor, updatedAt: now() };
    save();
    return { serverTime: now(), cursor: nextCursor, nextCursor, events, tombstones: db.tombstones.slice(-500), conflicts: db.syncConflicts.slice(-50) };
  }
  function history(username) {
    ensure();
    return { cursors: Object.values(db.syncCursors).filter((item) => item.username === username), events: db.syncEvents.filter((event) => event.username === username || !event.username).slice(-100), conflicts: db.syncConflicts.slice(-50), queue: db.syncQueue[username] || [] };
  }
  return { normalize, apply, pushEvents, pullEvents, history, ensure };
}

module.exports = createSyncEngine;
