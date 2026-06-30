"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const adminRenderer = fs.readFileSync(path.join(root, "src", "admin-renderer.js"), "utf8");
const adminCss = fs.readFileSync(path.join(root, "src", "admin.css"), "utf8");
const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
const required = [
  [renderer, "nv139ForwardMessage"],
  [renderer, "nv139SavedMessagesPage"],
  [renderer, "nv139MediaHistory"],
  [renderer, "nv139NotificationCenter"],
  [renderer, "nv139PasteHandler"],
  [renderer, "nv139MentionDropdown"],
  [renderer, "nv139SelectionBar"],
  [renderer, "nv139UserProfile2"],
  [adminRenderer, "nv139AdminUiFix"],
  [adminCss, "NightVault 1.4.1 admin responsive polish"],
  [main, "nv139LegacyBackupImport"],
];
const missing = required.filter(([text, needle]) => !text.includes(needle)).map(([, needle]) => needle);
if (missing.length) {
  console.error("Messenger audit failed. Missing:", missing.join(", "));
  process.exit(1);
}
console.log("Messenger audit OK: 1.4.1 features and admin UI fixes are present.");
