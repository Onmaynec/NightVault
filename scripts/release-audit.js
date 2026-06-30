"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function read(file){ return fs.readFileSync(path.join(root, file), "utf8"); }
function ok(name, condition, detail=""){
  if(!condition){ console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`); process.exitCode = 1; }
  else console.log(`✓ ${name}`);
}
const pkg = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/release.yml");
const renderer = read("src/renderer.js");
const css = read("src/style.css");
ok("package version is semver 1.4.0", pkg.version === "1.4.0", pkg.version);
ok("release label is 1.4.0", renderer.includes('const RELEASE_LABEL = "1.4.0"') && renderer.includes("NightVault 1.4.0"));
ok("github publish target is Onmaynec/NightVault", JSON.stringify(pkg.build?.publish || {}).includes("Onmaynec") && JSON.stringify(pkg.build?.publish || {}).includes("NightVault"));
ok("workflow builds without direct electron-builder publish", workflow.includes("--publish never"));
ok("workflow publishes release assets via softprops", workflow.includes("softprops/action-gh-release") && workflow.includes("dist/*.exe") && workflow.includes("dist/*.yml") && workflow.includes("dist/*.blockmap"));
ok("custom voice player present", renderer.includes("voiceBubbleNV137") && renderer.includes("seekVoice137") && renderer.includes("cycleVoiceSpeed137"));
ok("media viewer service present", renderer.includes("openMediaViewerByRef137") && renderer.includes("mediaViewer137") && css.includes(".mediaViewer137"));
ok("partial render fingerprints present", renderer.includes("lastChatsHash") || renderer.includes("chatFingerprint") && renderer.includes("messagesFingerprint") && renderer.includes("contactsFingerprint"));
ok("backup package v2 present", read("src/main.js").includes("nightvault-backup") && read("src/main.js").includes("checksum"));
if(process.exitCode) throw new Error("NightVault release-audit failed");
console.log("NightVault 1.4.0 release-audit passed.");
