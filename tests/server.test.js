"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
let WebSocket = null;
try { WebSocket = require("ws"); } catch {}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of String(input).toUpperCase().replace(/=|\s|-/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest.at(-1) & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

async function waitForServer(baseUrl, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (child.exitCode !== null) throw new Error(`server exited: ${child.exitCode}`);
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

async function jsonRequest(baseUrl, route, { token, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(baseUrl + "/api" + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

test("NightVault 1.1 server security and messaging flow", { timeout: 45_000 }, async (t) => {
  if (!WebSocket) {
    t.skip("integration dependencies are not installed; run npm install before full server tests");
    return;
  }
  const port = await freePort();
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "nightvault-test-"));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NIGHTVAULT_PORT: String(port),
      NIGHTVAULT_HOST: "127.0.0.1",
      NIGHTVAULT_DATA_DIR: runtime,
      NIGHTVAULT_CORS_ORIGINS: "null,http://allowed.example",
      NIGHTVAULT_ACCESS_MINUTES: "5",
      NODE_NO_WARNINGS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 3000).unref();
    });
    fs.rmSync(runtime, { recursive: true, force: true });
    assert.equal(stderr, "", stderr);
  });

  const health = await waitForServer(baseUrl, child);
  assert.equal(health.version, require("../package.json").version);
  assert.equal(health.transportSecurity, false);

  const denied = await jsonRequest(baseUrl, "/health", {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(denied.response.status, 403);

  const aliceRegistration = await jsonRequest(baseUrl, "/register", {
    method: "POST",
    body: { username: "alice", displayName: "Alice", password: "alice-password-123" },
    headers: { Origin: "null" },
  });
  assert.equal(aliceRegistration.response.status, 201);
  assert.ok(aliceRegistration.data.accessToken);
  assert.ok(aliceRegistration.data.refreshToken);
  let aliceToken = aliceRegistration.data.accessToken;
  let aliceRefresh = aliceRegistration.data.refreshToken;

  const bobRegistration = await jsonRequest(baseUrl, "/register", {
    method: "POST",
    body: { username: "bob_user", displayName: "Bob", password: "bob-password-123" },
  });
  assert.equal(bobRegistration.response.status, 201);
  const bobToken = bobRegistration.data.accessToken;

  const contactRequest = await jsonRequest(baseUrl, "/contacts/bob_user/request", {
    method: "POST",
    token: aliceToken,
    body: {},
  });
  assert.equal(contactRequest.response.status, 200);
  assert.equal(contactRequest.data.relation, "outgoing");

  const bobContactsBefore = await jsonRequest(baseUrl, "/contacts", { token: bobToken });
  assert.equal(bobContactsBefore.response.status, 200);
  assert.equal(bobContactsBefore.data.contacts.incoming[0].user.username, "alice");

  const acceptContact = await jsonRequest(baseUrl, "/contacts/alice/accept", {
    method: "POST",
    token: bobToken,
    body: {},
  });
  assert.equal(acceptContact.response.status, 200);
  assert.equal(acceptContact.data.contacts.accepted[0].user.username, "alice");

  const updateContact = await jsonRequest(baseUrl, "/contacts/bob_user", {
    method: "PUT",
    token: aliceToken,
    body: { alias: "Bob QA", note: "контакт для теста", favorite: true },
  });
  assert.equal(updateContact.response.status, 200);
  assert.equal(updateContact.data.contacts.accepted[0].alias, "Bob QA");

  const form = new FormData();
  form.append("file", new Blob(["hello protected file"], { type: "text/plain" }), "hello.txt");
  const uploadResponse = await fetch(baseUrl + "/api/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: form,
  });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.match(uploaded.id, /^[a-f0-9]{36}$/);

  const unauthorizedFile = await fetch(baseUrl + uploaded.url, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  assert.equal(unauthorizedFile.status, 404);

  const privateChat = await jsonRequest(baseUrl, "/chats/private/bob_user", {
    method: "POST",
    token: aliceToken,
    body: {},
  });
  assert.equal(privateChat.response.status, 200);
  const chatId = privateChat.data.chat.id;
  assert.match(chatId, /^private_[a-f0-9]{24}$/);

  const sent = await jsonRequest(baseUrl, `/chats/${chatId}/messages`, {
    method: "POST",
    token: aliceToken,
    body: { text: "Привет", attachment: { id: uploaded.id } },
  });
  assert.equal(sent.response.status, 201);
  const messageId = sent.data.message.id;
  const replyWithMention = await jsonRequest(baseUrl, `/chats/${chatId}/messages`, {
    method: "POST",
    token: bobToken,
    body: { text: "@alice отвечаю", replyTo: messageId },
  });
  assert.equal(replyWithMention.response.status, 201);
  assert.deepEqual(replyWithMention.data.message.mentions, ["alice"]);
  assert.equal(replyWithMention.data.message.replyPreview.id, messageId);


  const authorizedFile = await fetch(baseUrl + uploaded.url, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  assert.equal(authorizedFile.status, 200);
  assert.equal(await authorizedFile.text(), "hello protected file");

  const badReaction = await jsonRequest(baseUrl, `/messages/${messageId}/react`, {
    method: "POST",
    token: bobToken,
    body: { emoji: "</button><script>alert(1)</script>" },
  });
  assert.equal(badReaction.response.status, 400);

  const goodReaction = await jsonRequest(baseUrl, `/messages/${messageId}/react`, {
    method: "POST",
    token: bobToken,
    body: { emoji: "🔥" },
  });
  assert.equal(goodReaction.response.status, 200);
  assert.deepEqual(goodReaction.data.message.reactions["🔥"], ["bob_user"]);

  for (const text of ["two", "three", "four"]) {
    const result = await jsonRequest(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      token: aliceToken,
      body: { text },
    });
    assert.equal(result.response.status, 201);
  }
  const page = await jsonRequest(baseUrl, `/chats/${chatId}/messages?limit=2`, {
    token: aliceToken,
  });
  assert.equal(page.response.status, 200);
  assert.equal(page.data.messages.length, 2);
  assert.ok(page.data.nextCursor);

  const setup2fa = await jsonRequest(baseUrl, "/2fa/setup", {
    method: "POST",
    token: aliceToken,
    body: { password: "alice-password-123" },
  });
  assert.equal(setup2fa.response.status, 200);
  assert.match(setup2fa.data.secret, /^[A-Z2-7]+$/);
  const enabled2fa = await jsonRequest(baseUrl, "/2fa/enable", {
    method: "POST",
    token: aliceToken,
    body: { code: totp(setup2fa.data.secret) },
  });
  assert.equal(enabled2fa.response.status, 200);
  assert.equal(enabled2fa.data.recoveryCodes.length, 8);

  const loginWithout2fa = await jsonRequest(baseUrl, "/login", {
    method: "POST",
    body: { username: "alice", password: "alice-password-123" },
  });
  assert.equal(loginWithout2fa.response.status, 401);
  assert.equal(loginWithout2fa.data.details.code, "two_factor_required");

  const loginWith2fa = await jsonRequest(baseUrl, "/login", {
    method: "POST",
    body: {
      username: "alice",
      password: "alice-password-123",
      twofa: totp(setup2fa.data.secret),
    },
  });
  assert.equal(loginWith2fa.response.status, 200);

  const refreshed = await jsonRequest(baseUrl, "/refresh", {
    method: "POST",
    body: { refreshToken: aliceRefresh },
  });
  assert.equal(refreshed.response.status, 200);
  assert.notEqual(refreshed.data.accessToken, aliceToken);
  aliceToken = refreshed.data.accessToken;
  aliceRefresh = refreshed.data.refreshToken;

  const oldSession = await jsonRequest(baseUrl, "/me", {
    token: aliceRegistration.data.accessToken,
  });
  assert.equal(oldSession.response.status, 401);
  const currentSession = await jsonRequest(baseUrl, "/me", { token: aliceToken });
  assert.equal(currentSession.response.status, 200);
  assert.equal(currentSession.data.settings.twoFactorEnabled, true);
  const privacyUpdate = await jsonRequest(baseUrl, "/me", {
    method: "PUT",
    token: aliceToken,
    body: { privacy: { lastSeen: "contacts", avatar: "contacts", status: "contacts", presenceMode: "recently" } },
  });
  assert.equal(privacyUpdate.response.status, 200);
  assert.equal(privacyUpdate.data.user.privacy.status, "contacts");
  assert.equal(privacyUpdate.data.user.privacy.presenceMode, "recently");
  const securityEvents = await jsonRequest(baseUrl, "/security-events", { token: aliceToken });
  assert.equal(securityEvents.response.status, 200);
  assert.ok(securityEvents.data.events.some((event) => event.type === "privacy_update"));

  const exportResponse = await jsonRequest(baseUrl, `/chats/${chatId}/export`, { token: aliceToken });
  assert.equal(exportResponse.response.status, 200);
  assert.equal(exportResponse.data.export.format, "nightvault-chat-export");
  assert.equal(exportResponse.data.export.version, 2);
  assert.ok(exportResponse.data.export.counts.messages >= 2);


  const ticketResponse = await jsonRequest(baseUrl, "/ws-ticket", {
    method: "POST",
    token: aliceToken,
    body: {},
  });
  assert.equal(ticketResponse.response.status, 200);
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}?ticket=${encodeURIComponent(ticketResponse.data.ticket)}`,
    );
    const timer = setTimeout(() => reject(new Error("websocket timeout")), 5000);
    ws.once("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve();
    });
    ws.once("error", reject);
  });
});
