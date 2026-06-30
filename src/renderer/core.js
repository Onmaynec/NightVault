"use strict";

window.NVRendererCore = Object.freeze({
  version: "1.4.6",
  qaRelease: "Real Electron QA & UI Safety Update",
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
    "qa",
  ],
  virtualMessageDefault: 220,
  maxAttachmentBytes: 100 * 1024 * 1024,
  maxImageBytes: 15 * 1024 * 1024,
  maxVideoBytes: 100 * 1024 * 1024,
  maxAudioBytes: 30 * 1024 * 1024,
});
