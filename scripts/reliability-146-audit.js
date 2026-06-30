#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const pkg = require("../package.json");
function read(file) { return fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : ""; }
function ok(name, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} reliability-146 ${name}${detail ? " — " + detail : ""}`);
  if (!pass) process.exitCode = 1;
}
ok("package version 1.4.6", pkg.version === "1.4.6", pkg.version);
ok("real e2e script exists", read("scripts/e2e-real-smoke.js").includes("remote-debugging-port") && read("scripts/e2e-real-smoke.js").includes("Electron"));
ok("static e2e script is explicitly named", fs.existsSync(path.join(root, "scripts", "e2e-static-smoke.js")));
ok("two profile smoke exists", read("scripts/e2e-two-profile-smoke.js").includes("clientProfileId"));
ok("verify split exists", pkg.scripts["verify:static"] && pkg.scripts["verify:server"] && pkg.scripts["verify:electron"]);
ok("ui actions report exists", read("scripts/ui-actions-report.js").includes("legacy inline handlers"));
ok("duplicate globals audit exists", read("scripts/duplicate-globals-audit.js").includes("duplicate global"));
ok("version consistency exists", read("scripts/version-consistency.js").includes("version consistency"));
ok("release assets check exists", read("scripts/release-assets-check.js").includes("NightVault-Setup"));
ok("release source packager exists", read("scripts/prepare-release-source.js").includes("release-source"));
ok("UI actions docs exist", read("docs/UI_ACTIONS_MAP.md").includes("data-action"));
ok("legacy compatibility docs exist", read("docs/LEGACY_COMPATIBILITY_MAP.md").includes("nv144BugfixLayer"));
ok("git guide 1.4.6 exists", read("docs/GIT_UPLOAD_GUIDE_1.4.6.md").includes("v1.4.6"));
ok("release history 1.4.6 exists", read("release-history/read_version1.4.6RELEASE.md").includes("Real Electron QA"));
ok("apply patch script exists", read("scripts/apply-146-patch.js").includes("nv146QaLayer"));
ok("no full renderer rewrite in patch archive", !fs.existsSync(path.join(root, "src", "renderer.js")) || read("docs/NIGHTVAULT_1.4.6_CHANGESET.md").includes("not fully modularized"));
if (process.exitCode) process.exit(1);
console.log("NightVault 1.4.6 reliability audit passed.");
