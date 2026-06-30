#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function read(file){ return fs.readFileSync(path.join(root, file), "utf8"); }
function ok(name, pass, detail="") { console.log(`${pass ? "OK" : "FAIL"} reliability-145: ${name}${detail ? " — " + detail : ""}`); if (!pass) process.exitCode = 1; }
const pkg = require("../package.json");
const config = read("server/lib/config.js");
const core = read("src/renderer/core.js");
const changelog = read("assets/changelog.json");
const release = fs.existsSync(path.join(root, "release-history", "read_version1.4.5RELEASE.md")) ? read("release-history/read_version1.4.5RELEASE.md") : "";
ok("package keeps 1.4.5+ reliability compatibility", /^1\.4\.[5-9]$/.test(pkg.version), pkg.version);
ok("upload envelope limit aligned", config.includes("Math.max(100") && core.includes("maxAttachmentBytes: 100"));
ok("fresh db migration present", fs.existsSync(path.join(root, "server/migrations/014_145_schema_alignment.sql")));
ok("fresh db smoke script present", fs.existsSync(path.join(root, "scripts/fresh-db-smoke.js")));
ok("db audit script present", fs.existsSync(path.join(root, "scripts/db-audit.js")));
ok("ui actions audit present", fs.existsSync(path.join(root, "scripts/ui-actions-audit.js")));
ok("cleanup report present", fs.existsSync(path.join(root, "scripts/cleanup-report.js")));
ok("release notes present", release.includes("NightVault 1.4.5"));
ok("changelog has 1.4.5", changelog.includes('"version": "1.4.5"'));
ok("docs upload guide present", fs.existsSync(path.join(root, "docs/GIT_UPLOAD_GUIDE_1.4.5.md")));
if (process.exitCode) process.exit(1);
console.log(`NightVault ${pkg.version} keeps 1.4.5 reliability compatibility.`);
