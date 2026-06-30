#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const VERSION = "1.4.7";

function file(p) { return path.join(root, p); }
function exists(p) { return fs.existsSync(file(p)); }
function read(p) { return fs.readFileSync(file(p), "utf8"); }
function write(p, text) {
  fs.mkdirSync(path.dirname(file(p)), { recursive: true });
  fs.writeFileSync(file(p), text);
  console.log("updated", p);
}
function backup(p) {
  const src = file(p);
  if (!fs.existsSync(src)) return;
  const dst = file(`${p}.bak-147`);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
}
function replaceOnce(text, needle, replacement) {
  return text.includes(needle) ? text.replace(needle, replacement) : text;
}
function ensureLine(text, needle, insertion, afterNeedle) {
  if (text.includes(needle)) return text;
  const index = text.indexOf(afterNeedle);
  if (index < 0) return text + "\n" + insertion + "\n";
  const end = text.indexOf("\n", index);
  return text.slice(0, end + 1) + insertion + "\n" + text.slice(end + 1);
}

function updatePackage() {
  const p = "package.json";
  if (!exists(p)) throw new Error("package.json not found");
  backup(p);
  const pkg = JSON.parse(read(p));
  pkg.version = VERSION;
  pkg.description = "NightVault 1.4.7 — UI Action Router & CSP Hardening Update: data-action router, strict CSP diagnostics, legacy inline audits and safer partial renders.";
  pkg.scripts = pkg.scripts || {};
  Object.assign(pkg.scripts, {
    "apply:147": "node scripts/apply-147-patch.js",
    "ui-actions:audit": "node scripts/ui-actions-audit.js",
    "ui-actions:report": "node scripts/ui-actions-report.js",
    "csp:audit": "node scripts/csp-consistency-audit.js",
    "no-render-in-input-audit": "node scripts/no-render-in-input-audit.js",
    "legacy:audit": "node scripts/legacy-compatibility-audit.js",
    "reliability-147-audit": "node scripts/reliability-147-audit.js",
    "ui-action-click-map": "node scripts/ui-action-click-map.js",
  });
  if (!pkg.scripts["release:qa"]) pkg.scripts["release:qa"] = "npm run verify && npm run ui-actions:audit && npm run csp:audit && npm run reliability-147-audit";
  else if (!pkg.scripts["release:qa"].includes("reliability-147-audit")) pkg.scripts["release:qa"] += " && npm run reliability-147-audit";
  const verifyAdditions = ["ui-actions:audit", "csp:audit", "no-render-in-input-audit", "legacy:audit", "reliability-147-audit"];
  if (pkg.scripts.verify) {
    for (const name of verifyAdditions) {
      const token = `npm run ${name}`;
      if (!pkg.scripts.verify.includes(token)) pkg.scripts.verify += ` && ${token}`;
    }
  }
  write(p, JSON.stringify(pkg, null, 2) + "\n");
}

function updateIndex() {
  const p = "src/index.html";
  if (!exists(p)) return console.warn("skip", p);
  backup(p);
  let text = read(p);
  text = text.replace(/script-src-attr\s+'unsafe-inline'/g, "script-src-attr 'none'");
  text = ensureLine(text, "renderer/strict-csp.js", '    <script src="renderer/strict-csp.js"></script>', '<script src="boot-check.js"></script>');
  text = ensureLine(text, "client/ui-action-router-147.js", '    <script src="client/ui-action-router-147.js"></script>', '<script src="client/ui-action-router.js"></script>');
  write(p, text);
}

function updateAdminHtml() {
  const p = "src/admin.html";
  if (!exists(p)) return console.warn("skip", p);
  backup(p);
  let text = read(p);
  text = text.replace(/script-src-attr\s+'unsafe-inline'/g, "script-src-attr 'none'");
  if (!text.includes("admin-actions.js")) {
    if (text.includes("admin-renderer.js")) text = text.replace(/\s*<script src="admin-renderer\.js"><\/script>/, '\n    <script src="admin-actions.js"></script>\n    <script src="admin-renderer.js"></script>');
    else text = text.replace("</body>", '    <script src="admin-actions.js"></script>\n  </body>');
  }
  write(p, text);
}

function updateMainCsp() {
  const p = "src/main.js";
  if (!exists(p)) return console.warn("skip", p);
  backup(p);
  let text = read(p);
  text = text.replace(/"script-src-attr 'unsafe-inline'",/g, '"script-src-attr \'none\'",');
  text = text.replace(/script-src-attr\s+'unsafe-inline'/g, "script-src-attr 'none'");
  write(p, text);
}

function updateRendererLayer() {
  const p = "src/renderer.js";
  if (!exists(p)) return console.warn("skip", p);
  let text = read(p);
  if (text.includes("nv147UiActionLayer")) return console.log("renderer layer already present");
  backup(p);
  text += `\n\n// NightVault 1.4.7 — UI Action Router & CSP hardening compatibility layer.\n(function nv147UiActionLayer(){\n  if (window.nv147UiActionLayerInstalled) return;\n  window.nv147UiActionLayerInstalled = true;\n  window.nv147GetUiDebug = function(){\n    return {\n      version: \"${VERSION}\",\n      actionTelemetry: window.NVActionTelemetry || null,\n      csp: typeof window.nv147CspDebug === \"function\" ? window.nv147CspDebug() : null,\n      lastAction: window.NVActionTelemetry?.lastAction || null,\n    };\n  };\n  window.addEventListener(\"DOMContentLoaded\", () => {\n    try { window.nvBindPartial?.(document, \"nv147-domcontentloaded\"); } catch {}\n  }, { once:true });\n})();\n`;
  write(p, text);
}

function mergeChangelog() {
  const p = "assets/changelog.json";
  const additionPath = "assets/changelog.1.4.7.json";
  if (!exists(additionPath)) return;
  const addition = JSON.parse(read(additionPath));
  let data = { items: [] };
  if (exists(p)) {
    try { data = JSON.parse(read(p)); } catch { data = { items: [] }; }
  }
  if (Array.isArray(data.items)) {
    data.items = data.items.filter((item) => item.version !== VERSION);
    data.items.unshift(addition);
  } else {
    data.latest = VERSION;
    data[VERSION] = addition;
  }
  data.latest = VERSION;
  write(p, JSON.stringify(data, null, 2) + "\n");
}

function ensureIgnoreFiles() {
  const gitignore = ".gitignore";
  const entries = ["dist/", "server/runtime/", "uploads/", "debug-packs/", "tester-reports/", "NightVault-Setup-*.exe", "NightVault-*-x64.exe", "*.blockmap", "*.tmp", "*.bak-147"];
  let text = exists(gitignore) ? read(gitignore) : "";
  for (const entry of entries) if (!text.split(/\r?\n/).includes(entry)) text += `${text.endsWith("\n") || !text ? "" : "\n"}${entry}\n`;
  write(gitignore, text);
  const releaseignore = ".releaseignore";
  write(releaseignore, ["node_modules/", "dist/", "server/runtime/", "uploads/", ".git/", ".env", "debug-packs/", "tester-reports/", "*.bak-147"].join("\n") + "\n");
}

updatePackage();
updateIndex();
updateAdminHtml();
updateMainCsp();
updateRendererLayer();
mergeChangelog();
ensureIgnoreFiles();
console.log("NightVault 1.4.7 patch applied. Run npm run verify next.");
