"use strict";

module.exports = Object.freeze({
  version: "1.0.5",
  note: "Routes are being extracted from legacy server.js. New server services live in server/services; server.js remains the compatibility entry point for 1.0.x.",
  plannedRoutes: [
    "auth",
    "users",
    "contacts",
    "chats",
    "messages",
    "files",
    "security",
    "backup",
  ],
});
