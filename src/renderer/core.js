"use strict";

window.NVRendererCore = Object.freeze({
  version: "1.0.9",
  modules: [
    "state",
    "api",
    "backup",
    "websocket",
    "chat-list",
    "messages",
    "contacts",
    "settings",
    "profile",
    "privacy",
    "security",
  ],
  virtualMessageDefault: 220,
  maxAttachmentBytes: 50 * 1024 * 1024,
  maxImageBytes: 15 * 1024 * 1024,
  maxVideoBytes: 100 * 1024 * 1024,
  maxAudioBytes: 30 * 1024 * 1024,
});
