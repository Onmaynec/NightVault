#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function read(file) { return fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : ""; }
function ok(name, pass, detail = "") { console.log(`${pass ? "OK" : "FAIL"} reliability-147: ${name}${detail ? " — " + detail : ""}`); if (!pass) process.exitCode = 1; }
const pkg = require(path.join(root, "package.json"));
const index = read("src/index.html");
const main = read("src/main.js");
const renderer = read("src/renderer.js");
ok("package version 1.4.7", pkg.version === "1.4.7", pkg.version);
ok("strict CSP script loaded", index.includes("renderer/strict-csp.js"));
ok("1.4.7 router script loaded", index.includes("client/ui-action-router-147.js"));
ok("script-src-attr unsafe-inline removed from client", !/script-src-attr\s+'unsafe-inline'/.test(index));
ok("script-src-attr unsafe-inline removed from main", !/script-src-attr\s+'unsafe-inline'/.test(main));
ok("renderer has nv147 compatibility layer", renderer.includes("nv147UiActionLayer"));
ok("ui action router file exists", fs.existsSync(path.join(root, "src/client/ui-action-router-147.js")));
ok("strict csp diagnostics file exists", fs.existsSync(path.join(root, "src/renderer/strict-csp.js")));
ok("admin actions file exists", fs.existsSync(path.join(root, "src/admin-actions.js")));
ok("docs test plan exists", fs.existsSync(path.join(root, "docs/testing/UI_ACTIONS_TEST_PLAN_1.4.7.md")));
ok("release history exists", fs.existsSync(path.join(root, "release-history/read_version1.4.7RELEASE.md")));
if (process.exitCode) process.exit(1);
console.log("NightVault 1.4.7 reliability audit passed.");
