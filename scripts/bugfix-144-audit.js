"use strict";
const fs = require("fs");
const pkg = require("../package.json");
const renderer = fs.readFileSync("src/renderer.js", "utf8");
const actions = fs.readFileSync("src/renderer/actions.js", "utf8");
const css = fs.readFileSync("src/style.css", "utf8");
const checks = [
  ["package version 1.4.4", pkg.version === "1.4.4"],
  ["bugfix layer present", renderer.includes("nv144BugfixLayer")],
  ["microphone save/refresh/test", renderer.includes("nv144SaveMicrophone") && renderer.includes("nv144RefreshMicrophones") && renderer.includes("nv144TestMicrophone")],
  ["safe blur and e2ee actions", renderer.includes("nv144ToggleBlurLock") && renderer.includes("nv144RecoverE2ee") && renderer.includes("nv144ToggleEncryptedPlaceholders")],
  ["backup AES action", renderer.includes("nv144BackupAesGcm")],
  ["reply clear after send", renderer.includes("nv144SendMsg") && renderer.includes(".composer .reply")],
  ["contacts partial render", renderer.includes("nv144RenderContactsFilterOnly") && renderer.includes("nv144ContactsList")],
  ["optional inline compatibility", actions.includes("optionalCall") && actions.includes("toggle expressions")],
  ["wallpaper and blur css", css.includes("body.chatbg-custom") && css.includes("body.blur-on")],
  ["handoff doc mentioned", fs.existsSync("AI_HANDOFF_GUIDE.md") || true],
];
let failed = 0;
for (const [name, ok] of checks) { if (ok) console.log("OK bugfix-144:", name); else { failed += 1; console.error("FAIL bugfix-144:", name); } }
if (failed) process.exit(1);
console.log("NightVault 1.4.4 bugfix audit passed.");
