#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function read(file) { return fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : ""; }
function ok(name, pass, detail = "") { console.log(`${pass ? "OK" : "FAIL"} csp-audit: ${name}${detail ? " — " + detail : ""}`); if (!pass) process.exitCode = 1; }
const index = read("src/index.html");
const admin = read("src/admin.html");
const main = read("src/main.js");
ok("client CSP removes script-src-attr unsafe-inline", !/script-src-attr\s+'unsafe-inline'/.test(index));
ok("main CSP removes script-src-attr unsafe-inline", !/script-src-attr\s+'unsafe-inline'/.test(main));
ok("client CSP keeps style inline for themes", /style-src[^;]*'unsafe-inline'/.test(index) || main.includes("style-src 'self' 'unsafe-inline'"));
ok("client CSP blocks objects and frames", index.includes("object-src 'none'") && index.includes("frame-src 'none'"));
ok("strict CSP diagnostics loaded", index.includes("renderer/strict-csp.js"));
if (admin) ok("admin CSP removes script-src-attr unsafe-inline", !/script-src-attr\s+'unsafe-inline'/.test(admin));
if (process.exitCode) process.exit(1);
console.log("NightVault 1.4.7 CSP consistency audit passed.");
