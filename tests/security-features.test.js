"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mentions } = require("../server/lib/validation");
const { sniffMime } = require("../server/lib/security");
const { normalizePrivacy, areContacts } = require("../server/services/privacy");
const { buildChatExport } = require("../server/services/chat-export");
const { uploadClassForMime } = require("../server/services/upload-policy");
const { sendContactRequest, acceptContactRequest, updateContactMeta, listContacts, areRealContacts } = require("../server/services/contacts");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("mentions parser extracts safe usernames only", () => {
  assert.deepEqual(mentions("hi @Roman_01 and @bob_user! <@bad>").sort(), ["bob_user", "roman_01"]);
  assert.deepEqual(mentions("@no @ab @valid_name"), ["valid_name"]);
});

test("mime sniffer blocks executable extensions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nightvault-mime-"));
  const file = path.join(dir, "payload.exe");
  fs.writeFileSync(file, Buffer.from("MZ"));
  const result = sniffMime(file, "application/octet-stream", "payload.exe");
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(result.blocked, true);
});


test("privacy service supports contacts and presence modes", () => {
  const db = { chats: { one: { type: "private", members: ["alice", "bob"] } } };
  assert.equal(areContacts(db, "alice", "bob"), true);
  assert.deepEqual(normalizePrivacy({ avatar: "contacts", presenceMode: "recently" }), {
    avatar: "contacts",
    lastSeen: "all",
    status: "all",
    presenceMode: "recently",
  });
});

test("chat export service returns safe export envelope", () => {
  const chat = { id: "private_123", members: ["alice", "bob"] };
  const messages = [{ id: "m1", from: "alice", text: "hi", mentions: ["bob"], createdAt: 1 }];
  const exported = buildChatExport({
    chat,
    messages,
    viewer: "alice",
    chatSafe: (value) => ({ id: value.id }),
    safeMessage: (value) => ({ id: value.id, mentions: value.mentions || [] }),
    messageVisibleTo: () => true,
  });
  assert.equal(exported.format, "nightvault-chat-export");
  assert.equal(exported.version, 2);
  assert.equal(exported.counts.mentions, 1);
});

test("upload policy classifies supported mime classes", () => {
  assert.equal(uploadClassForMime("image/png"), "image");
  assert.equal(uploadClassForMime("audio/webm"), "audio");
  assert.equal(uploadClassForMime("application/pdf"), "document");
  assert.equal(uploadClassForMime("text/html"), "unknown");
});


test("contacts service supports requests, accept and local metadata", () => {
  const db = { users: { alice: { username: "alice", displayName: "Alice" }, bob: { username: "bob", displayName: "Bob" } }, contacts: {} };
  const requested = sendContactRequest(db, "alice", "bob", 100);
  assert.equal(requested.status, "outgoing");
  assert.equal(db.contacts.alice.bob.status, "outgoing");
  assert.equal(db.contacts.bob.alice.status, "incoming");
  const accepted = acceptContactRequest(db, "bob", "alice", 200);
  assert.equal(accepted.status, "accepted");
  assert.equal(areRealContacts(db, "alice", "bob"), true);
  const updated = updateContactMeta(db, "alice", "bob", { alias: "Боб работа", note: "проект", favorite: true }, 300);
  assert.equal(updated.ok, true);
  const book = listContacts(db, "alice", "alice", (user) => ({ username: user.username, displayName: user.displayName }));
  assert.equal(book.accepted[0].alias, "Боб работа");
  assert.equal(book.accepted[0].favorite, true);
});

test("renderer does not redeclare preload nv bridge", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8");
  assert.equal(/\b(?:const|let|var)\s+nv\b/.test(source), false);
  assert.equal(source.includes("const nvBridge = window.nv ||"), true);
});

test("readiness service summarizes 1.3.0 foundation", () => {
  const { collectReadinessReport } = require("../server/services/readiness");
  const db = { schemaVersion: 11, users: {}, chats: {}, files: {}, contacts: {}, securityEvents: [], syncEvents: [], featureFlags: { sqliteReady: true, e2eeReady: true, syncEngineReady: true } };
  const report = collectReadinessReport(db, { version: "1.3.0", host: "127.0.0.1", tlsCertPath: "", tlsKeyPath: "" });
  assert.equal(report.ok, true);
  assert.equal(report.checks.database.ok, true);
  assert.equal(report.checks.e2ee.ok, true);
  assert.equal(report.checks.syncEngine.ok, true);
  assert.equal(report.version, "1.3.0");
});

test("1.1.3 renderer fixes api file endpoints and safe avatar preview", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8");
  assert.equal(source.includes('if (value.startsWith("/api/")) return getServerHttp() + value;'), true);
  assert.equal(source.includes("setProfileAssetPreview(ref, file)"), true);
  assert.equal(source.includes("safeProfileRenderAfterAsset(\"Аватар\")"), true);
  assert.equal(source.includes("validatePickedProfileImage"), true);
});

test("1.1.3 CSS keeps chat bottom-locked and admin tables constrained", () => {
  const style = fs.readFileSync(path.join(__dirname, "../src/style.css"), "utf8");
  const adminStyle = fs.readFileSync(path.join(__dirname, "../src/admin.css"), "utf8");
  assert.match(style, /\.messagesInner\{[^}]*margin-top:auto!important/s);
  assert.match(style, /\.mineWrap\{justify-content:flex-end!important/s);
  assert.match(style, /\.composer\{[^}]*display:grid!important[^}]*bottom:auto!important/s);
  assert.equal(adminStyle.includes("table-layout:fixed"), true);
  assert.equal(adminStyle.includes("tableToolbar"), true);
});

test("1.1.4 adds optimistic profile previews and chat bottom observers", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8");
  assert.equal(source.includes("setTemporaryProfilePreview"), true);
  assert.equal(source.includes("settleTemporaryProfilePreview"), true);
  assert.equal(source.includes("assetDisplayUrl"), true);
  assert.equal(source.includes("ensureChatBottomWatch"), true);
  assert.equal(source.includes("MutationObserver"), true);
  assert.equal(source.includes("ResizeObserver"), true);
});

test("1.1.4 UI cleanup constrains chat, upload notices and admin data toolbar", () => {
  const style = fs.readFileSync(path.join(__dirname, "../src/style.css"), "utf8");
  const adminStyle = fs.readFileSync(path.join(__dirname, "../src/admin.css"), "utf8");
  const admin = fs.readFileSync(path.join(__dirname, "../src/admin-renderer.js"), "utf8");
  assert.equal(style.includes("NightVault 1.1.4"), true);
  assert.equal(style.includes(".chatEmptyState"), true);
  assert.equal(style.includes(".uploadNotice"), true);
  assert.equal(admin.includes("tableLimit"), true);
  assert.equal(admin.includes("dbLimit"), true);
  assert.equal(adminStyle.includes(".dbMain"), true);
  assert.equal(adminStyle.includes(".miniLoader"), true);
});
