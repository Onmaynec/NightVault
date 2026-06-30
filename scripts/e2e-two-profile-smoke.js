#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function ok(name, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} e2e:profiles ${name}${detail ? " — " + detail : ""}`);
  if (!pass) process.exitCode = 1;
}
const main = read("src/main.js");
const pkg = require("../package.json");
ok("version is 1.4.6", pkg.version === "1.4.6", pkg.version);
ok("main supports --profile", main.includes("--profile=") && main.includes("clientProfileId"));
ok("main isolates userData per client profile", main.includes("client-profiles") && main.includes("app.setPath(\"userData\""));
ok("shared e2ee vault remains outside per-profile userData", main.includes("sharedE2eeVaultPath") && main.includes("originalUserDataPath"));
ok("windows profile scripts documented", read("README.md").includes("start-client-profile.bat test-account-1") && read("README.md").includes("test-account-2"));
if (process.exitCode) process.exit(1);
console.log("e2e:profiles ok — static two-profile prerequisites passed. Run the two start-client-profile.bat commands on Windows for live QA.");
