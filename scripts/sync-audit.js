"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
const sync = fs.readFileSync(path.join(root, "server", "lib", "sync-engine.js"), "utf8");
const store = fs.readFileSync(path.join(root, "server", "lib", "store.js"), "utf8");
const required = ["eventId", "clientId", "idempotencyKey", "tombstones", "syncCursors", "syncConflicts", "/api/sync/history"];
for (const token of required) {
  if (!server.includes(token) && !sync.includes(token) && !store.includes(token)) throw new Error(`sync-audit missing ${token}`);
  console.log("ok", token);
}
console.log("sync audit ok");
