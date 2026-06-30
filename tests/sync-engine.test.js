"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createSyncEngine = require("../server/lib/sync-engine");

test("Sync Engine 2.0 applies idempotent note events with cursor history", async () => {
  const db = { users: { alice: { username: "alice" } }, chats: {}, messages: {}, notes: {}, links: {}, syncEvents: [], syncQueue: {}, syncCursors: {}, syncIdempotency: {}, tombstones: [], syncConflicts: [] };
  const engine = createSyncEngine({ db, save: async () => {}, now: () => 1000, randomId: () => "abc123" });
  const item = { entity: "note", operation: "upsert", entityId: "n1", clientId: "c1", deviceId: "d1", version: 1, idempotencyKey: "key-1", payload: { title: "T", body: "B" } };
  const first = await engine.pushEvents([item], { username: "alice", deviceId: "d1", clientId: "c1" });
  const second = await engine.pushEvents([item], { username: "alice", deviceId: "d1", clientId: "c1" });
  assert.equal(first.accepted.length, 1);
  assert.equal(second.accepted[0].duplicate, true);
  assert.equal(db.notes.alice[0].title, "T");
  const pulled = engine.pullEvents({ username: "alice", deviceId: "d1" }, { cursor: 0, limit: 10 });
  assert.equal(pulled.events.length, 1);
  assert.ok(db.syncCursors["alice:d1"].cursor >= 1000);
});

test("Sync Engine 2.0 creates tombstones and rejects older conflicts", async () => {
  const chat = { id: "c", members: ["alice"] };
  const db = { users: { alice: { username: "alice" } }, chats: { c: chat }, messages: { c: [{ id: "m1", chatId: "c", from: "alice", text: "new", version: 5, createdAt: 1 }] }, notes: {}, links: {}, syncEvents: [], syncQueue: {}, syncCursors: {}, syncIdempotency: {}, tombstones: [], syncConflicts: [] };
  const engine = createSyncEngine({ db, save: async () => {}, now: () => 2000, randomId: () => "def456" });
  const old = await engine.pushEvents([{ entity: "message", operation: "update", entityId: "m1", chatId: "c", version: 1, idempotencyKey: "old", payload: { text: "old" } }], { username: "alice" });
  assert.equal(old.rejected.length, 1);
  assert.equal(db.syncConflicts.length, 1);
  const del = await engine.pushEvents([{ entity: "message", operation: "delete", entityId: "m1", chatId: "c", version: 6, idempotencyKey: "del" }], { username: "alice" });
  assert.equal(del.accepted.length, 1);
  assert.equal(db.tombstones[0].entityId, "m1");
  assert.equal(db.messages.c[0].deletedForAll, true);
});
