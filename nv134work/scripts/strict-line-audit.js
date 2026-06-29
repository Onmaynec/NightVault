"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const files = [
  "src/main.js", "src/preload.js", "src/admin-preload.js", "src/admin-renderer.js", "src/boot-check.js", "src/renderer.js",
  "src/renderer/core.js", "src/renderer/api.js", "src/renderer/messages.js", "src/renderer/backup.js", "src/renderer/contacts.js", "src/renderer/diagnostics.js", "src/renderer/actions.js",
  "server/server.js", "server/lib/config.js", "server/lib/security.js", "server/lib/store.js", "server/lib/validation.js",
  "server/services/security-events.js", "server/services/privacy.js", "server/services/upload-policy.js", "server/services/messages.js", "server/services/chat-export.js", "server/services/contacts.js", "server/services/readiness.js",
  "scripts/doctor.js", "scripts/globalfix-audit.js", "scripts/render-audit.js", "tests/server.test.js", "tests/security-features.test.js",
];
const cssFiles = ["src/style.css", "src/admin.css"];
const htmlFiles = ["src/index.html", "src/admin.html"];
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function fail(message) { console.error("FAIL", message); process.exitCode = 1; }
function ok(message) { console.log("OK", message); }
for (const file of [...files, ...cssFiles, ...htmlFiles]) {
  if (!fs.existsSync(path.join(root, file))) fail(`${file}: missing`); else ok(`${file}: exists`);
}
for (const file of files) {
  const res = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (res.status !== 0) fail(`${file}: syntax ${res.stderr || res.stdout}`); else ok(`${file}: syntax`);
}
for (const file of cssFiles) {
  const text = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth < 0) fail(`${file}: extra closing brace near ${i}`);
  }
  if (depth !== 0) fail(`${file}: unbalanced braces ${depth}`); else ok(`${file}: balanced braces`);
}
for (const file of htmlFiles) {
  const text = read(file);
  for (const src of [...text.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1])) {
    const target = path.join(path.dirname(path.join(root, file)), src);
    if (!fs.existsSync(target)) fail(`${file}: missing script ${src}`); else ok(`${file}: script ${src}`);
  }
}
function auditInline(file) {
  const text = read(file);
  const functions = new Set([...text.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  for (const match of text.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) functions.add(match[1]);
  const ignored = new Set(["stopPropagation", "preventDefault", "querySelector", "remove", "JSON", "String", "Number", "encodeURIComponent", "decodeURIComponent"]);
  for (const attr of text.matchAll(/on\w+=["']([^"']*)["']/g)) {
    for (const call of attr[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = call[1];
      if (!ignored.has(name) && !functions.has(name)) fail(`${file}: inline handler calls missing ${name}`);
    }
  }
  ok(`${file}: inline handlers target existing functions`);
}
auditInline("src/renderer.js");
auditInline("src/admin-renderer.js");
const renderer = read("src/renderer.js");
const style = read("src/style.css");
if (!renderer.includes("nvAssetState") || !renderer.includes("Promise.allSettled")) fail("renderer: guarded asset hydration missing"); else ok("renderer: guarded asset hydration");
if (!renderer.includes("setProfileAssetPreview") || !renderer.includes("safeProfileRenderAfterAsset") || !renderer.includes("data-fallback")) fail("renderer: avatar fallback missing"); else ok("renderer: avatar fallback");
if (!style.includes(".messagesInner") || !style.includes("margin-top:auto") || !style.includes(".mineWrap{justify-content:flex-end")) fail("style: stable bottom chat rules missing"); else ok("style: stable bottom chat rules");
if (!renderer.includes("function apiEndpoint") || !renderer.includes("getServerHttp() + value")) fail("renderer: api/files endpoint fix missing"); else ok("renderer: api/files endpoint fix");
if (renderer.includes('<div class="messageBottomSpacer"></div>')) fail("renderer: old bottom spacer still rendered"); else ok("renderer: no old bottom spacer render");
if (!style.includes(".e2eeBadge") || !style.includes("display:none!important")) fail("style: E2EE label hide missing"); else ok("style: E2EE label hidden");
if (process.exitCode) process.exit(process.exitCode);
console.log("Strict line audit passed.");
