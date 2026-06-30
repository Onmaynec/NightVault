"use strict";
const fs = require("fs");
const required = [
  "src/main.js",
  "src/preload.js",
  "src/admin.html",
  "src/admin.css",
  "src/admin-preload.js",
  "src/admin-renderer.js",
  "src/index.html",
  "src/boot-check.js",
  "src/renderer.js",
  "src/renderer/core.js",
  "src/renderer/api.js",
  "src/renderer/messages.js",
  "src/renderer/backup.js",
  "src/renderer/contacts.js",
  "src/renderer/diagnostics.js",
  "src/renderer/actions.js",
  "src/style.css",
  "server/server.js",
  "server/lib/config.js",
  "server/lib/security.js",
  "server/lib/store.js",
  "server/lib/validation.js",
  "server/services/security-events.js",
  "server/services/privacy.js",
  "server/services/upload-policy.js",
  "server/services/messages.js",
  "server/services/chat-export.js",
  "server/services/contacts.js",
  "server/services/readiness.js",
  "server/routes/README.js",
  "tests/server.test.js",
  "tests/security-features.test.js",
  "assets/icon.png",
  "assets/icon.ico",
  "package.json",
  "SECURITY.md",
];
let ok = true;
for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error("missing", file);
    ok = false;
  } else {
    console.log("ok", file);
  }
}
console.log(ok ? "NightVault doctor: OK" : "NightVault doctor: problems found");
if (!ok) process.exitCode = 1;
