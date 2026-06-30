
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const checks = [];
function ok(name, condition, detail = "") { checks.push({ name, passed: Boolean(condition), detail }); if (!condition) process.exitCode = 1; }
function text(file){ return fs.readFileSync(path.join(root,file),"utf8"); }
const pkg = JSON.parse(text("package.json"));
ok("version_1_3_6", pkg.version === "1.3.7", pkg.version);
const renderer = text("src/renderer.js");
const server = text("server/server.js");
const admin = text("src/admin-renderer.js");
const css = text("src/style.css");
ok("notes_ui", renderer.includes("nv120SaveNote") && renderer.includes("notesPage"));
ok("links_ui", renderer.includes("nv120SaveLink") && renderer.includes("linksPage"));
ok("diagnostics", renderer.includes("nv120CollectDebugReport"));
ok("sync_controls", renderer.includes("manualSyncPull") && renderer.includes("manualSyncPush"));
ok("devices_controls", renderer.includes("nv120ExportRecovery"));
ok("server_notes", server.includes('/api/notes'));
ok("server_links", server.includes('/api/links'));
ok("admin_dashboard", admin.includes("renderDashboard") && admin.includes("Dashboard сервера"));
ok("admin_extended_tests", admin.includes("websocket") && admin.includes("db-integrity"));
ok("css_overlay", css.includes("NightVault 1.3.7 Mega Release UI hardening"));
console.log(JSON.stringify({ ok: checks.every(c=>c.passed), checks }, null, 2));
if (process.exitCode) process.exit(process.exitCode);
