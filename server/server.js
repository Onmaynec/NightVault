"use strict";

const fs = require("fs");
const fsp = fs.promises;
const http = require("http");
const https = require("https");
const path = require("path");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const WebSocket = require("ws");

const config = require("./lib/config");
const { db, save, flush, openSqlite, sqliteStatus } = require("./lib/store");
const createSyncEngine = require("./lib/sync-engine");
const { buildDebugReport } = require("./lib/debug-report");
const {
  randomId,
  randomToken,
  sha256,
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  verifyTotp,
  generateRecoveryCodes,
  sanitizeFilename,
  sniffMime,
} = require("./lib/security");
const V = require("./lib/validation");
const { recordSecurityEvent, listSecurityEvents } = require("./services/security-events");
const { normalizePrivacy, canViewProfileField, statusForUser } = require("./services/privacy");
const { validateUploadedFile } = require("./services/upload-policy");
const { buildReplyPreview, extractMentionsForChat, canUserMutateMessage } = require("./services/messages");
const { buildChatExport } = require("./services/chat-export");
const { collectReadinessReport } = require("./services/readiness");
const { fingerprintForPublicKey, safetyNumberForChat, listTrustedDevices, setTrust, rotateDeviceKey } = require("./services/e2ee-trust");
const { enrichMediaFile, cleanupOrphanFiles } = require("./services/media-pipeline");
const Notifications = require("./services/notifications");
const Presence = require("./services/presence");
const SearchIndex = require("./services/search-index");
const {
  getRelationship,
  sendContactRequest,
  acceptContactRequest,
  declineContactRequest,
  updateContactMeta,
  removeEntries: removeContactEntries,
  listContacts,
} = require("./services/contacts");

const now = () => Date.now();
const syncEngine = createSyncEngine({ db, save, now, randomId });
const sockets = new Map();
const wsTickets = new Map();
const rateBuckets = new Map();
const runtimeMetrics = { startedAt: Date.now(), requests: [], errors: [], messages: [], files: [] };

function log(level, event, details = {}) {
  console.log(
    JSON.stringify({
      level,
      event,
      time: new Date().toISOString(),
      ...details,
    }),
  );
}

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function sendError(res, status, error, details) {
  return res.status(status).json({ error, ...(details ? { details } : {}) });
}
function sanitizeLogMessage(value) {
  return String(value || "").replace(/[A-Z]:\\[^\n"]+/g, "[path]").replace(/\b(?:access|refresh)Token=[^\s]+/gi, "$1Token=[redacted]").slice(0, 320);
}
function jsonDepth(value, maxDepth = 24, depth = 0) {
  if (depth > maxDepth) return depth;
  if (!value || typeof value !== "object") return depth;
  let next = depth;
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    next = Math.max(next, jsonDepth(item, maxDepth, depth + 1));
    if (next > maxDepth) return next;
  }
  return next;
}
function rejectDeepJson(req, res, next) {
  if (req.body && jsonDepth(req.body) > 24) return sendError(res, 413, "Слишком глубокий JSON.");
  next();
}
function originAllowedForWs(origin = "") {
  if (!origin || origin === "null") return true;
  if (config.corsOrigins.includes("*")) return true;
  if (config.corsOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return ["localhost", "127.0.0.1", config.host].includes(host);
  } catch { return false; }
}

function requestIp(req) {
  return String(
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
  )
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

function rateLimit(name, { windowMs, max, key }) {
  return (req, res, next) => {
    const bucketKey = `${name}:${key ? key(req) : requestIp(req)}`;
    const timestamp = now();
    let bucket = rateBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= timestamp) {
      bucket = { count: 0, resetAt: timestamp + windowMs };
      rateBuckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, max - bucket.count)),
    );
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.resetAt - timestamp) / 1000)),
      );
      return sendError(res, 429, "Слишком много запросов. Повторите позже.");
    }
    return next();
  };
}

setInterval(() => {
  const timestamp = now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= timestamp) rateBuckets.delete(key);
  }
  for (const [ticket, value] of wsTickets) {
    if (value.expiresAt <= timestamp) wsTickets.delete(ticket);
  }
}, 60_000).unref();

function safeSettings(user) {
  const settings = user.settings || {};
  return {
    notify: settings.notify !== false,
    chatBg: V.text(settings.chatBg, 64, "particles"),
    fontSize: V.number(settings.fontSize, 12, 22, 15),
    fontFamily: V.text(settings.fontFamily, 32, "system"),
    theme: V.text(settings.theme, 64, "aurora"),
    accent: /^#[a-f0-9]{6}$/i.test(String(settings.accent || "")) ? settings.accent : "",
    density: V.text(settings.density, 32, "comfortable"),
    bubbleStyle: V.text(settings.bubbleStyle, 32, "soft"),
    motion: V.text(settings.motion, 32, "balanced"),
    customThemes: Array.isArray(settings.customThemes) ? settings.customThemes.slice(0, 24) : [],
    twoFactorEnabled: Boolean(user.twoFactor?.secret),
  };
}

function repFor(username) {
  const items = db.reputation[username] || [];
  const score = items.reduce(
    (sum, item) => sum + (item.type === "praise" ? 1 : -2),
    0,
  );
  return { score, items: items.slice(-80).reverse() };
}

function verifyStatus(username) {
  const score = repFor(username).score;
  if (score < -8) return "suspicious";
  if (score >= 5) return "verified";
  return "normal";
}

function isOnline(username) {
  return Boolean(sockets.get(username)?.size);
}

function safeUser(user, viewer = "") {
  if (!user) return null;
  const privacy = normalizePrivacy(user.privacy || {});
  user.privacy = privacy;
  const showAvatar = canViewProfileField(db, viewer, user, "avatar");
  const presence = statusForUser(db, sockets, user, viewer, now());
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    bio: user.bio || "",
    avatar: showAvatar ? user.avatar || "" : "",
    banner: showAvatar ? user.banner || "" : "",
    profileColor: user.profileColor || "",
    avatarFrame: user.avatarFrame || "",
    createdAt: user.createdAt || 0,
    lastSeen: presence.lastSeen || 0,
    status: presence.status,
    statusText: presence.statusText,
    fingerprint: user.fingerprint || "",
    e2eeDeviceCount: Object.keys(user.e2eeDevices || {}).length,
    privacy,
    verification: verifyStatus(user.username),
    contact: viewer ? getRelationship(db, viewer, user.username) : "none",
  };
}

function messageVisibleTo(message, username) {
  return (
    !message.deletedForAll &&
    !(message.deletedFor || []).includes(username) &&
    (!message.selfDestructAt || message.selfDestructAt > now())
  );
}

function safeMessage(message) {
  if (!message) return null;
  return {
    id: message.id,
    chatId: message.chatId,
    from: message.from,
    text: message.text || "",
    e2ee: message.e2ee || null,
    attachment: message.attachment || null,
    replyTo: message.replyTo || null,
    replyPreview: message.replyPreview || null,
    mentions: Array.isArray(message.mentions) ? message.mentions : [],
    reactions: message.reactions || {},
    editedAt: message.editedAt || null,
    createdAt: message.createdAt,
    deliveredTo: message.deliveredTo || [],
    readBy: message.readBy || [],
    selfDestructAt: message.selfDestructAt || null,
  };
}

function chatSafe(chat, viewer) {
  const messages = (db.messages[chat.id] || []).filter((message) =>
    messageVisibleTo(message, viewer),
  );
  const last = messages.at(-1) || null;
  const otherUsername =
    chat.type === "private"
      ? chat.members.find((member) => member !== viewer)
      : null;
  return {
    id: chat.id,
    type: chat.type,
    title: chat.title || "",
    avatar: chat.avatar || "",
    members: [...chat.members],
    admins: [...(chat.admins || [])],
    owner: chat.owner || chat.admins?.[0] || "",
    createdAt: chat.createdAt || 0,
    pinned: [...(chat.pinned || [])],
    muted: { ...(chat.muted || {}) },
    description: chat.description || "",
    permissions: {
      write: chat.permissions?.write !== false,
      invite: chat.permissions?.invite !== false,
      avatar: chat.permissions?.avatar === true,
    },
    other: otherUsername ? safeUser(db.users[otherUsername], viewer) : null,
    last: safeMessage(last),
    unread: messages.filter(
      (message) =>
        message.from !== viewer && !(message.readBy || []).includes(viewer),
    ).length,
  };
}

function emitToUser(username, payload) {
  const encoded = JSON.stringify(payload);
  for (const ws of sockets.get(username) || []) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(encoded);
      } catch {}
    }
  }
}

function emitChat(chat, payloadFactory) {
  for (const username of chat.members) {
    const payload =
      typeof payloadFactory === "function"
        ? payloadFactory(username)
        : payloadFactory;
    emitToUser(username, payload);
  }
}

function ensureSaved(username) {
  const existing = Object.values(db.chats).find(
    (chat) => chat.type === "saved" && chat.members[0] === username,
  );
  if (existing) return existing;
  const chatId = `saved_${randomId(12)}`;
  db.chats[chatId] = {
    id: chatId,
    type: "saved",
    title: "Избранное",
    avatar: "",
    members: [username],
    admins: [username],
    owner: username,
    createdAt: now(),
    pinned: [],
    muted: {},
    permissions: { write: true, invite: false, avatar: false },
  };
  db.messages[chatId] = [];
  save();
  return db.chats[chatId];
}

function getChatForUser(chatId, username) {
  const chat = db.chats[chatId];
  return chat?.members?.includes(username) ? chat : null;
}

function findMessage(messageId) {
  for (const chat of Object.values(db.chats)) {
    const message = (db.messages[chat.id] || []).find(
      (candidate) => candidate.id === messageId,
    );
    if (message) return { chat, message };
  }
  return null;
}

function findVisibleMessageForUser(messageId, username) {
  const found = findMessage(messageId);
  if (!found || !found.chat.members.includes(username)) return null;
  if (!messageVisibleTo(found.message, username)) return null;
  return found;
}


function normalizeE2eePublicKey(value) {
  if (!value || typeof value !== "object") return null;
  const key = {
    kty: String(value.kty || ""),
    crv: String(value.crv || ""),
    x: String(value.x || ""),
    y: String(value.y || ""),
    ext: true,
  };
  if (key.kty !== "EC" || key.crv !== "P-256") return null;
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(key.x) || !/^[A-Za-z0-9_-]{40,100}$/.test(key.y)) return null;
  return key;
}

function rememberE2eeDevice(user, body, session) {
  const deviceId = String(body?.e2eeDeviceId || "").replace(/[^a-f0-9]/gi, "").slice(0, 64).toLowerCase();
  const publicKey = normalizeE2eePublicKey(body?.e2eePublicKey);
  if (!deviceId || !publicKey) return null;
  user.e2eeDevices = user.e2eeDevices && typeof user.e2eeDevices === "object" ? user.e2eeDevices : {};
  const timestamp = now();
  user.e2eeDevices[deviceId] = {
    id: deviceId,
    username: user.username,
    publicKey,
    sessionId: session?.id || "",
    device: String(body?.deviceName || reqUserAgent(body) || session?.device || "NightVault device").slice(0, 120),
    createdAt: user.e2eeDevices[deviceId]?.createdAt || timestamp,
    lastSeenAt: timestamp,
  };
  return user.e2eeDevices[deviceId];
}

function reqUserAgent(body) {
  return body?.userAgent || "";
}

function publicE2eeDevicesForUser(username) {
  const user = db.users[username];
  if (!user) return [];
  return Object.values(user.e2eeDevices || {})
    .filter((device) => normalizeE2eePublicKey(device.publicKey))
    .map((device) => ({
      id: device.id,
      username,
      publicKey: device.publicKey,
      device: device.device || "NightVault device",
      createdAt: device.createdAt || 0,
      lastSeenAt: device.lastSeenAt || 0,
    }));
}

function normalizeE2eeEnvelope(value) {
  if (!value || typeof value !== "object") return null;
  const iv = String(value.iv || "");
  const ciphertext = String(value.ciphertext || "");
  const senderDeviceId = String(value.senderDeviceId || "").slice(0, 80);
  const senderPublicKey = normalizeE2eePublicKey(value.senderPublicKey);
  const recipients = Array.isArray(value.recipients) ? value.recipients.slice(0, 256).map((item) => ({
    username: V.username(item?.username) || "",
    deviceId: String(item?.deviceId || "").slice(0, 80),
    iv: String(item?.iv || "").slice(0, 128),
    keyCiphertext: String(item?.keyCiphertext || "").slice(0, 512),
  })).filter((item) => item.username && item.deviceId && item.iv && item.keyCiphertext) : [];
  if (!iv || !ciphertext || !senderDeviceId || !senderPublicKey || !recipients.length) return null;
  return { v: 1, alg: "P-256+AES-256-GCM", iv: iv.slice(0, 128), ciphertext: ciphertext.slice(0, 24000), senderDeviceId, senderPublicKey, recipients };
}

function recordSyncEvent(type, entity, id, chatId, payload = {}, meta = {}) {
  db.syncEvents = Array.isArray(db.syncEvents) ? db.syncEvents : [];
  const createdAt = now();
  const event = {
    id: meta.eventId || `sync_${randomId(12)}`,
    eventId: meta.eventId || `sync_${randomId(12)}`,
    clientId: meta.clientId || "server",
    username: meta.username || payload?.message?.from || payload?.username || "server",
    deviceId: meta.deviceId || "server",
    type,
    operation: type === "delete" ? "tombstone" : type === "create" ? "create" : "update",
    entity,
    entityId: id,
    chatId: chatId || "",
    version: Number(meta.version || payload?.message?.version || 1),
    idempotencyKey: meta.idempotencyKey || `server:${entity}:${id}:${createdAt}`,
    createdAt,
    payload,
  };
  event.id = event.eventId;
  db.syncEvents.push(event);
  if (db.syncEvents.length > 5000) db.syncEvents = db.syncEvents.slice(-5000);
  return event;
}

function issueSession(user, req, existingSession = null) {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(48);
  const timestamp = now();
  const session = {
    id: existingSession?.id || randomId(8),
    username: user.username,
    createdAt: existingSession?.createdAt || timestamp,
    lastUsedAt: timestamp,
    accessExpiresAt: timestamp + config.accessTtlMs,
    refreshHash: sha256(refreshToken),
    refreshExpiresAt: timestamp + config.refreshTtlMs,
    device: String(req.headers["user-agent"] || "Unknown device").slice(0, 240),
    ip: requestIp(req),
  };
  db.sessions[sha256(accessToken)] = session;
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(config.accessTtlMs / 1000),
    session,
  };
}

function sessionResponse(tokens, user) {
  return {
    token: tokens.accessToken,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: safeUser(user, user.username),
    settings: safeSettings(user),
    e2ee: { enabled: true, deviceCount: Object.keys(user.e2eeDevices || {}).length },
  };
}

function auth(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return sendError(res, 401, "Требуется авторизация.");
  const accessHash = sha256(token);
  const session = db.sessions[accessHash];
  if (!session) return sendError(res, 401, "Сессия недействительна.");
  if (session.accessExpiresAt <= now()) {
    if (session.refreshExpiresAt <= now()) {
      delete db.sessions[accessHash];
      save();
    }
    return sendError(res, 401, "Сессия истекла.", { code: "token_expired" });
  }
  const user = db.users[session.username];
  if (!user) {
    delete db.sessions[accessHash];
    save();
    return sendError(res, 401, "Аккаунт не найден.");
  }
  req.accessHash = accessHash;
  req.session = session;
  req.user = user;
  const timestamp = now();
  if (timestamp - (session.lastUsedAt || 0) > 60_000) {
    session.lastUsedAt = timestamp;
    user.lastSeen = timestamp;
    save();
  }
  return next();
}


function verifySecondFactor(user, code) {
  if (!user.twoFactor?.secret) return { ok: true };
  let secret;
  try {
    secret = decryptSecret(user.twoFactor.secret);
  } catch {
    return { ok: false };
  }
  if (verifyTotp(secret, code)) return { ok: true };
  const recoveryHash = sha256(
    String(code || "")
      .trim()
      .toUpperCase(),
  );
  const index = (user.twoFactor.recoveryHashes || []).indexOf(recoveryHash);
  if (index >= 0) {
    user.twoFactor.recoveryHashes.splice(index, 1);
    save();
    return { ok: true, recoveryUsed: true };
  }
  return { ok: false };
}

function normalizedFileReference(value) {
  const match = String(value || "").match(/^\/api\/files\/([a-f0-9]{36})$/i);
  return match ? match[1] : "";
}

function canAccessFile(file, username) {
  if (!file) return false;
  if (file.owner === username) return true;
  if (file.kind === "avatar" || file.kind === "banner") return true;
  if (file.chatId) return Boolean(getChatForUser(file.chatId, username));
  return false;
}

function bindUploadedFile(fileId, chatId, username) {
  const file = db.files[fileId];
  if (!file || file.owner !== username) return null;
  if (file.chatId && file.chatId !== chatId) return null;
  file.chatId = chatId;
  file.kind = "attachment";
  return {
    id: file.id,
    url: `/api/files/${file.id}`,
    name: file.originalName,
    size: file.size,
    type: file.mime,
  };
}

function isBlockedBetween(first, second) {
  return (
    (db.blocks[first] || []).includes(second) ||
    (db.blocks[second] || []).includes(first)
  );
}

function purgeExpiredMessages() {
  const timestamp = now();
  let changed = false;
  for (const [chatId, messages] of Object.entries(db.messages)) {
    const keep = [];
    for (const message of messages || []) {
      if (message.selfDestructAt && message.selfDestructAt <= timestamp) {
        changed = true;
        if (message.attachment?.id) {
          const file = db.files[message.attachment.id];
          if (file) {
            fsp.unlink(path.join(config.uploadsDir, file.id)).catch(() => {});
            delete db.files[file.id];
          }
        }
        continue;
      }
      keep.push(message);
    }
    db.messages[chatId] = keep;
  }
  if (changed) save();
}

setInterval(purgeExpiredMessages, 60_000).unref();
purgeExpiredMessages();

function purgeOrphanFiles() {
  const cutoff = now() - 24 * 60 * 60 * 1000;
  let changed = false;
  for (const [fileId, file] of Object.entries(db.files || {})) {
    if (file.kind !== "pending" || file.createdAt > cutoff) continue;
    fsp.unlink(path.join(config.uploadsDir, fileId)).catch(() => {});
    delete db.files[fileId];
    changed = true;
  }
  if (changed) save();
}
setInterval(purgeOrphanFiles, 60 * 60_000).unref();
purgeOrphanFiles();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", false);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=()");
  res.setHeader("Cache-Control", "no-store");
  const origin = String(req.headers.origin || "");
  const allowedOrigin = !origin || config.corsOrigins.includes(origin);
  if (!allowedOrigin)
    return sendError(res, 403, "Источник запроса не разрешён.");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use(express.json({ limit: config.maxJsonBytes }));
app.use(rejectDeepJson);
app.use(
  rateLimit("global", {
    windowMs: 60_000,
    max: 300,
  }),
);

// NightVault 1.3.9 — maintenance mode and server metrics for Admin Pro.
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const t = Date.now();
    runtimeMetrics.requests.push({ t, path: req.path, method: req.method, status: res.statusCode, ms: t - started });
    if (res.statusCode >= 400) runtimeMetrics.errors.push({ t, path: req.path, status: res.statusCode });
    if (res.statusCode < 400 && req.method === "POST" && /\/api\/chats\/[^/]+\/messages/.test(req.path)) runtimeMetrics.messages.push({ t });
    if (res.statusCode < 400 && req.method === "POST" && /\/api\/files/.test(req.path)) runtimeMetrics.files.push({ t });
    runtimeMetrics.messages = runtimeMetrics.messages.filter((x) => t - x.t < 60_000);
    runtimeMetrics.files = runtimeMetrics.files.filter((x) => t - x.t < 60_000);
    runtimeMetrics.requests = runtimeMetrics.requests.filter((x) => t - x.t < 60_000);
    runtimeMetrics.errors = runtimeMetrics.errors.filter((x) => t - x.t < 60_000);
  });
  const mode = global.__nightVaultMaintenance || {};
  if (!mode.enabled) return next();
  const apiPath = String(req.path || req.url || "");
  if (apiPath === "/api/health" || apiPath.startsWith("/api/readiness") || req.method === "OPTIONS") return next();
  if (mode.allowLogin && apiPath === "/api/login") return next();
  if (mode.allowRead && req.method === "GET") return next();
  if (mode.blockRegistration && apiPath === "/api/register") return sendError(res, 503, mode.message || "Сервер на обслуживании.", { code:"maintenance" });
  if (mode.blockWrites && ["POST","PUT","DELETE"].includes(req.method)) return sendError(res, 503, mode.message || "Сервер на обслуживании.", { code:"maintenance" });
  next();
});

// NightVault 1.3.5 — подробный runtime-log для Server Admin.
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const pathName = String(req.path || req.url || "");
    if (pathName === "/api/health" || pathName === "/api/readiness") return;
    const method = String(req.method || "GET").toUpperCase();
    const isPollingGet = method === "GET" && (/^\/api\/contacts$/.test(pathName) || /^\/api\/chats(?:$|\/[^/]+\/messages$)/.test(pathName));
    if (isPollingGet) return;
    if (method === "POST" && pathName === "/api/ws-ticket" && res.statusCode < 400) return;
    const important = res.statusCode >= 400 || method !== "GET" || /\/(login|register|contacts|chats|messages|files|sync)/.test(pathName);
    if (!important) return;
    const user = req.user?.username || V.username(req.body?.username) || "guest";
    console.info("[api]", method, pathName, "status=" + res.statusCode, "user=" + user, "ip=" + requestIp(req), "ms=" + (Date.now() - started));
  });
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    version: config.version,
    time: now(),
    users: Object.keys(db.users).length,
    transportSecurity: Boolean(config.tlsCertPath && config.tlsKeyPath),
    readiness: collectReadinessReport(db, config).ok ? "ready" : "attention",
    schemaVersion: db.schemaVersion || 0,
  });
});

app.get("/api/readiness", (_req, res) => {
  const report = collectReadinessReport(db, config);
  res.status(report.ok ? 200 : 503).json(report);
});

app.get("/api/readiness/private", auth, (req, res) => {
  const report = collectReadinessReport(db, config, { private: true });
  recordSecurityEvent(db, req.user.username, "readiness_private_opened", { ok: report.ok });
  save();
  res.json(report);
});

const authLimiter = rateLimit("auth", {
  windowMs: 15 * 60_000,
  max: 12,
  key: (req) =>
    `${requestIp(req)}:${V.username(req.body?.username) || "unknown"}`,
});

app.post(
  "/api/register",
  authLimiter,
  asyncRoute(async (req, res) => {
    const username = V.username(req.body?.username);
    const password = V.password(req.body?.password);
    const displayName = V.text(req.body?.displayName || username, 64).trim();
    if (!username)
      return sendError(res, 400, "Ник: 3–32 символа, латиница, цифры и _. ");
    if (!password)
      return sendError(res, 400, "Пароль должен содержать 10–128 символов.");
    if (db.users[username])
      return sendError(res, 409, "Такой пользователь уже существует.");

    const timestamp = now();
    const user = {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      displayName: displayName || username,
      bio: "",
      avatar: "",
      banner: "",
      createdAt: timestamp,
      lastSeen: timestamp,
      fingerprint: randomId(8),
      settings: {
        notify: true,
        chatBg: "particles",
        fontSize: 15,
        fontFamily: "system",
      },
      privacy: normalizePrivacy({ lastSeen: "all", avatar: "all", status: "all", presenceMode: "online" }),
      twoFactor: null,
    };
    db.users[username] = user;
    db.contacts[username] = db.contacts[username] || {};
    ensureSaved(username);
    const tokens = issueSession(user, req);
    rememberE2eeDevice(user, req.body || {}, tokens.session);
    recordSyncEvent("create", "user", username, "", { username });
    recordSecurityEvent("account_register", {
      username,
      ip: requestIp(req),
      message: "Создан аккаунт NightVault.",
    });
    console.info("[auth] register", username, "ip=" + requestIp(req));
    await save({ immediate: true });
    return res.status(201).json(sessionResponse(tokens, user));
  }),
);

app.post(
  "/api/login",
  authLimiter,
  asyncRoute(async (req, res) => {
    const username = V.username(req.body?.username);
    const user = db.users[username];
    const passwordOk = user
      ? await bcrypt.compare(
          String(req.body?.password || ""),
          user.passwordHash,
        )
      : false;
    if (!user || !passwordOk) {
      recordSecurityEvent("login_failed", {
        username,
        ip: requestIp(req),
        severity: "warning",
        message: "Неудачная попытка входа.",
      });
      console.warn("[auth] login_failed", username || "unknown", "ip=" + requestIp(req));
      return sendError(res, 401, "Неверный логин или пароль.");
    }
    const secondFactor = verifySecondFactor(user, req.body?.twofa);
    if (!secondFactor.ok) {
      recordSecurityEvent("login_2fa_failed", {
        username,
        ip: requestIp(req),
        severity: "warning",
        message: "Неудачная проверка второго фактора.",
      });
      return sendError(
        res,
        401,
        "Требуется корректный код TOTP или recovery-код.",
        {
          code: "two_factor_required",
        },
      );
    }
    user.lastSeen = now();
    ensureSaved(username);
    const tokens = issueSession(user, req);
    rememberE2eeDevice(user, req.body || {}, tokens.session);
    recordSecurityEvent("login_success", {
      username,
      ip: requestIp(req),
      message: "Вход в аккаунт выполнен успешно.",
      meta: { sessionId: tokens.session.id },
    });
    console.info("[auth] login_success", username, "session=" + tokens.session.id, "ip=" + requestIp(req));
    await save({ immediate: true });
    return res.json(sessionResponse(tokens, user));
  }),
);


app.post(
  "/api/refresh",
  asyncRoute(async (req, res) => {
    const refreshToken = String(req.body?.refreshToken || "").trim();
    if (!refreshToken || refreshToken.length > 1024) {
      return sendError(res, 400, "Некорректный refresh-token.");
    }
    const refreshHash = sha256(refreshToken);
    const timestamp = now();
    let matchedAccessHash = "";
    let matchedSession = null;
    for (const [accessHash, session] of Object.entries(db.sessions)) {
      if (session.refreshHash === refreshHash) {
        matchedAccessHash = accessHash;
        matchedSession = session;
        break;
      }
    }
    if (!matchedSession) {
      return sendError(res, 404, "Сессия не найдена.");
    }
    if (matchedSession.refreshExpiresAt <= timestamp) {
      delete db.sessions[matchedAccessHash];
      await save({ immediate: true });
      return sendError(res, 401, "Refresh-token истёк.", { code: "refresh_expired" });
    }
    const user = db.users[matchedSession.username];
    if (!user) {
      delete db.sessions[matchedAccessHash];
      await save({ immediate: true });
      return sendError(res, 401, "Аккаунт не найден.");
    }
    delete db.sessions[matchedAccessHash];
    user.lastSeen = timestamp;
    const tokens = issueSession(user, req, matchedSession);
    await save({ immediate: true });
    return res.json(sessionResponse(tokens, user));
  }),
);

app.post(
  "/api/logout",
  auth,
  asyncRoute(async (req, res) => {
    delete db.sessions[req.accessHash];
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.get("/api/me", auth, (req, res) => {
  res.json({
    user: safeUser(req.user, req.user.username),
    settings: safeSettings(req.user),
  });
});

app.put(
  "/api/me",
  auth,
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    if (body.displayName !== undefined) {
      const displayName = V.text(body.displayName, 64).trim();
      if (!displayName) return sendError(res, 400, "Имя не может быть пустым.");
      req.user.displayName = displayName;
    }
    if (body.bio !== undefined) req.user.bio = V.text(body.bio, 800);
    if (body.profileColor !== undefined) {
      const color = String(body.profileColor || "");
      if (/^#[a-f0-9]{6}$/i.test(color)) req.user.profileColor = color;
    }
    if (body.avatarFrame !== undefined) {
      req.user.avatarFrame = V.text(body.avatarFrame, 32);
    }
    for (const field of ["avatar", "banner"]) {
      if (body[field] !== undefined) {
        if (body[field] === "" || body[field] === null || body[field] === false) {
          req.user[field] = "";
          continue;
        }
        const fileId = normalizedFileReference(body[field]);
        const file = db.files[fileId];
        if (!fileId || !file || file.owner !== req.user.username) {
          return sendError(res, 400, "Недопустимая ссылка на файл профиля.");
        }
        file.kind = field;
        file.chatId = null;
        req.user[field] = `/api/files/${fileId}`;
      }
    }
    if (body.settings && typeof body.settings === "object") {
      req.user.settings = {
        ...req.user.settings,
        notify: V.boolean(
          body.settings.notify,
          req.user.settings?.notify !== false,
        ),
        chatBg: V.text(
          body.settings.chatBg,
          32,
          req.user.settings?.chatBg || "particles",
        ),
        fontSize: V.number(
          body.settings.fontSize,
          12,
          22,
          req.user.settings?.fontSize || 15,
        ),
        fontFamily: V.text(
          body.settings.fontFamily,
          32,
          req.user.settings?.fontFamily || "system",
        ),
        theme: V.text(body.settings.theme, 64, req.user.settings?.theme || "aurora"),
        accent: /^#[a-f0-9]{6}$/i.test(String(body.settings.accent || "")) ? body.settings.accent : req.user.settings?.accent || "",
        density: V.text(body.settings.density, 32, req.user.settings?.density || "comfortable"),
        bubbleStyle: V.text(body.settings.bubbleStyle, 32, req.user.settings?.bubbleStyle || "soft"),
        motion: V.text(body.settings.motion, 32, req.user.settings?.motion || "balanced"),
        customThemes: Array.isArray(body.settings.customThemes) ? body.settings.customThemes.slice(0, 24) : req.user.settings?.customThemes || [],
      };
    }
    if (body.privacy && typeof body.privacy === "object") {
      req.user.privacy = normalizePrivacy(body.privacy, req.user.privacy);
      recordSecurityEvent("privacy_update", {
        username: req.user.username,
        ip: requestIp(req),
        severity: "info",
        message: "Пользователь обновил настройки приватности профиля.",
        meta: req.user.privacy,
      });
    }
    await save({ immediate: true });
    return res.json({
      user: safeUser(req.user, req.user.username),
      settings: safeSettings(req.user),
    });
  }),
);

app.post(
  "/api/change-password",
  auth,
  rateLimit("change-password", {
    windowMs: 15 * 60_000,
    max: 5,
    key: (req) => req.user.username,
  }),
  asyncRoute(async (req, res) => {
    const oldPassword = String(req.body?.oldPassword || "");
    const newPassword = V.password(req.body?.newPassword);
    if (!(await bcrypt.compare(oldPassword, req.user.passwordHash))) {
      return sendError(res, 403, "Текущий пароль неверен.");
    }
    if (!newPassword)
      return sendError(
        res,
        400,
        "Новый пароль должен содержать 10–128 символов.",
      );
    req.user.passwordHash = await bcrypt.hash(newPassword, 12);
    for (const [accessHash, session] of Object.entries(db.sessions)) {
      if (
        session.username === req.user.username &&
        accessHash !== req.accessHash
      ) {
        delete db.sessions[accessHash];
      }
    }
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/2fa/setup",
  auth,
  rateLimit("2fa-setup", {
    windowMs: 15 * 60_000,
    max: 5,
    key: (req) => req.user.username,
  }),
  asyncRoute(async (req, res) => {
    const passwordOk = await bcrypt.compare(
      String(req.body?.password || ""),
      req.user.passwordHash,
    );
    if (!passwordOk) return sendError(res, 403, "Пароль неверен.");
    const secret = generateTotpSecret();
    req.user.twoFactorPending = {
      secret: encryptSecret(secret),
      expiresAt: now() + 10 * 60_000,
    };
    await save({ immediate: true });
    const label = encodeURIComponent(`NightVault:${req.user.username}`);
    const issuer = encodeURIComponent("NightVault");
    return res.json({
      secret,
      otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      expiresAt: req.user.twoFactorPending.expiresAt,
    });
  }),
);

app.post(
  "/api/2fa/enable",
  auth,
  asyncRoute(async (req, res) => {
    const pending = req.user.twoFactorPending;
    if (!pending || pending.expiresAt <= now()) {
      delete req.user.twoFactorPending;
      await save({ immediate: true });
      return sendError(res, 400, "Настройка 2FA истекла. Начните заново.");
    }
    const secret = decryptSecret(pending.secret);
    if (!verifyTotp(secret, req.body?.code)) {
      return sendError(res, 400, "Неверный TOTP-код.");
    }
    const recoveryCodes = generateRecoveryCodes();
    req.user.twoFactor = {
      secret: encryptSecret(secret),
      enabledAt: now(),
      recoveryHashes: recoveryCodes.map((code) => sha256(code)),
    };
    delete req.user.twoFactorPending;
    await save({ immediate: true });
    return res.json({ ok: true, recoveryCodes });
  }),
);

app.post(
  "/api/2fa/disable",
  auth,
  asyncRoute(async (req, res) => {
    const passwordOk = await bcrypt.compare(
      String(req.body?.password || ""),
      req.user.passwordHash,
    );
    if (!passwordOk) return sendError(res, 403, "Пароль неверен.");
    if (!verifySecondFactor(req.user, req.body?.code).ok) {
      return sendError(res, 400, "Неверный TOTP или recovery-код.");
    }
    req.user.twoFactor = null;
    delete req.user.twoFactorPending;
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.get("/api/devices", auth, (req, res) => {
  const devices = Object.entries(db.sessions)
    .filter(([, session]) => session.username === req.user.username)
    .map(([accessHash, session]) => ({
      id: session.id,
      current: accessHash === req.accessHash,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.refreshExpiresAt,
      device: session.device,
      ip: session.ip,
      e2ee: Object.values(req.user.e2eeDevices || {}).some((device) => device.sessionId === session.id),
    }));
  res.json({ devices });
});

app.delete(
  "/api/devices/:id",
  auth,
  asyncRoute(async (req, res) => {
    const sessionId = V.text(req.params.id, 64);
    let removed = false;
    for (const [accessHash, session] of Object.entries(db.sessions)) {
      if (
        session.username === req.user.username &&
        session.id === sessionId &&
        accessHash !== req.accessHash
      ) {
        delete db.sessions[accessHash];
        removed = true;
      }
    }
    if (!removed)
      return sendError(res, 404, "Сессия не найдена или является текущей.");
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/devices/logout-all",
  auth,
  asyncRoute(async (req, res) => {
    for (const [accessHash, session] of Object.entries(db.sessions)) {
      if (
        session.username === req.user.username &&
        accessHash !== req.accessHash
      ) {
        delete db.sessions[accessHash];
      }
    }
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.get("/api/security-events", auth, (req, res) => {
  res.json({ events: listSecurityEvents(req.user.username, req.query.limit) });
});

app.get("/api/search", auth, (req, res) => {
  const query = V.text(req.query.q, 64).trim().toLowerCase();
  if (query.length < 2) return res.json({ users: [] });
  const users = Object.values(db.users)
    .filter(
      (user) =>
        user.username !== req.user.username &&
        (user.username.includes(query) ||
          String(user.displayName || "")
            .toLowerCase()
            .includes(query)),
    )
    .slice(0, 30)
    .map((user) => safeUser(user, req.user.username));
  return res.json({ users });
});


function contactBookFor(username) {
  return listContacts(db, username, username, safeUser);
}

function emitContactBooks(...usernames) {
  for (const username of new Set(usernames.filter(Boolean))) {
    if (db.users[username]) {
      emitToUser(username, { type: "contacts_update", contacts: contactBookFor(username) });
    }
  }
}

app.get("/api/contacts", auth, (req, res) => {
  return res.json({ contacts: contactBookFor(req.user.username) });
});

app.post(
  "/api/contacts/:username/request",
  auth,
  rateLimit("contacts-request", {
    windowMs: 60 * 60_000,
    max: 40,
    key: (req) => req.user.username,
  }),
  asyncRoute(async (req, res) => {
    const target = V.username(req.params.username);
    if (!target || !db.users[target]) return sendError(res, 404, "Пользователь не найден.");
    if (target === req.user.username) return sendError(res, 400, "Нельзя добавить себя в контакты.");
    if (isBlockedBetween(req.user.username, target)) return sendError(res, 403, "Контакт недоступен из-за блокировки.");
    const result = sendContactRequest(db, req.user.username, target, now());
    recordSecurityEvent(result.status === "accepted" ? "contact_accept" : "contact_request", {
      username: req.user.username,
      ip: requestIp(req),
      message: result.status === "accepted" ? "Контакт принят встречной заявкой." : "Отправлена заявка в контакты.",
      meta: { target, status: result.status },
    });
    await save({ immediate: true });
    emitContactBooks(req.user.username, target);
    return res.json({ ok: true, relation: getRelationship(db, req.user.username, target), contacts: contactBookFor(req.user.username) });
  }),
);

app.post(
  "/api/contacts/:username/accept",
  auth,
  asyncRoute(async (req, res) => {
    const requester = V.username(req.params.username);
    if (!requester || !db.users[requester]) return sendError(res, 404, "Пользователь не найден.");
    const result = acceptContactRequest(db, req.user.username, requester, now());
    if (!result.ok) return sendError(res, 404, "Заявка не найдена.");
    recordSecurityEvent("contact_accept", {
      username: req.user.username,
      ip: requestIp(req),
      message: "Заявка в контакты принята.",
      meta: { requester },
    });
    await save({ immediate: true });
    emitContactBooks(req.user.username, requester);
    return res.json({ ok: true, contacts: contactBookFor(req.user.username) });
  }),
);

app.post(
  "/api/contacts/:username/decline",
  auth,
  asyncRoute(async (req, res) => {
    const requester = V.username(req.params.username);
    if (!requester || !db.users[requester]) return sendError(res, 404, "Пользователь не найден.");
    declineContactRequest(db, req.user.username, requester);
    recordSecurityEvent("contact_decline", {
      username: req.user.username,
      ip: requestIp(req),
      message: "Заявка в контакты отклонена.",
      meta: { requester },
    });
    await save({ immediate: true });
    emitContactBooks(req.user.username, requester);
    return res.json({ ok: true, contacts: contactBookFor(req.user.username) });
  }),
);

app.put(
  "/api/contacts/:username",
  auth,
  asyncRoute(async (req, res) => {
    const target = V.username(req.params.username);
    if (!target || !db.users[target]) return sendError(res, 404, "Пользователь не найден.");
    const result = updateContactMeta(db, req.user.username, target, req.body || {}, now());
    if (!result.ok) return sendError(res, 404, "Контакт не найден.");
    await save({ immediate: true });
    emitContactBooks(req.user.username);
    return res.json({ ok: true, contacts: contactBookFor(req.user.username) });
  }),
);

app.delete(
  "/api/contacts/:username",
  auth,
  asyncRoute(async (req, res) => {
    const target = V.username(req.params.username);
    if (!target || !db.users[target]) return sendError(res, 404, "Пользователь не найден.");
    removeContactEntries(db, req.user.username, target);
    recordSecurityEvent("contact_remove", {
      username: req.user.username,
      ip: requestIp(req),
      message: "Контакт удалён.",
      meta: { target },
    });
    await save({ immediate: true });
    emitContactBooks(req.user.username, target);
    return res.json({ ok: true, contacts: contactBookFor(req.user.username) });
  }),
);

app.get("/api/user/:username", auth, (req, res) => {
  const username = V.username(req.params.username);
  const user = db.users[username];
  if (!user) return sendError(res, 404, "Пользователь не найден.");
  return res.json({ user: safeUser(user, req.user.username) });
});

app.get("/api/stats/:username", auth, (req, res) => {
  const username = V.username(req.params.username);
  const user = db.users[username];
  if (!user) return sendError(res, 404, "Пользователь не найден.");
  let sent = 0;
  let photos = 0;
  let files = 0;
  let groups = 0;
  let firstFriend = false;
  for (const chat of Object.values(db.chats)) {
    if (chat.members.includes(username) && chat.type === "private")
      firstFriend = true;
    if (
      (chat.admins || []).includes(username) &&
      ["group", "channel"].includes(chat.type)
    )
      groups += 1;
    for (const message of db.messages[chat.id] || []) {
      if (message.from !== username || message.deletedForAll) continue;
      sent += 1;
      if (message.attachment) {
        files += 1;
        if (String(message.attachment.type || "").startsWith("image/"))
          photos += 1;
      }
    }
  }
  const achievements = [];
  if (firstFriend) achievements.push("🏆 Первый друг");
  if (sent >= 1000) achievements.push("🏆 1000 сообщений");
  if (user.createdAt && now() - user.createdAt > 365 * 24 * 60 * 60 * 1000)
    achievements.push("🏆 Год в NightVault");
  if (groups > 0) achievements.push("🏆 Создал группу");
  return res.json({
    username,
    sent,
    photos,
    files,
    groups,
    createdAt: user.createdAt || 0,
    days: Math.max(
      0,
      Math.floor((now() - (user.createdAt || now())) / 86_400_000),
    ),
    achievements,
  });
});

app.get("/api/update-check", auth, (_req, res) => {
  res.json({
    current: config.version,
    latest: config.version,
    available: false,
    notes: "Проверка обновлений выполняется через подписанные GitHub Releases.",
  });
});

app.get("/api/reputation/:username", auth, (req, res) => {
  const username = V.username(req.params.username);
  if (!db.users[username])
    return sendError(res, 404, "Пользователь не найден.");
  return res.json(repFor(username));
});

app.post(
  "/api/reputation/:username",
  auth,
  rateLimit("reputation", {
    windowMs: 24 * 60 * 60_000,
    max: 10,
    key: (req) => req.user.username,
  }),
  asyncRoute(async (req, res) => {
    const username = V.username(req.params.username);
    if (!db.users[username])
      return sendError(res, 404, "Пользователь не найден.");
    if (username === req.user.username)
      return sendError(res, 400, "Нельзя оценивать себя.");
    const type = req.body?.type === "praise" ? "praise" : "report";
    const reasons = V.stringArray(req.body?.reasons, 5, 120);
    if (!reasons.length) return sendError(res, 400, "Укажите причину.");
    db.reputation[username] = (db.reputation[username] || []).filter(
      (item) => item.from !== req.user.username,
    );
    db.reputation[username].push({
      id: randomId(6),
      from: req.user.username,
      type,
      reasons,
      createdAt: now(),
    });
    await save({ immediate: true });
    return res.json(repFor(username));
  }),
);

app.post(
  "/api/block/:username",
  auth,
  asyncRoute(async (req, res) => {
    const username = V.username(req.params.username);
    if (!db.users[username] || username === req.user.username) {
      return sendError(res, 400, "Недопустимый пользователь.");
    }
    db.blocks[req.user.username] = db.blocks[req.user.username] || [];
    if (!db.blocks[req.user.username].includes(username)) {
      db.blocks[req.user.username].push(username);
    }
    removeContactEntries(db, req.user.username, username);
    recordSecurityEvent("contact_block", {
      username: req.user.username,
      ip: requestIp(req),
      message: "Пользователь заблокирован и удалён из контактов.",
      meta: { target: username },
    });
    await save({ immediate: true });
    emitContactBooks(req.user.username, username);
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/unblock/:username",
  auth,
  asyncRoute(async (req, res) => {
    const username = V.username(req.params.username);
    db.blocks[req.user.username] = (db.blocks[req.user.username] || []).filter(
      (value) => value !== username,
    );
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);



fs.mkdirSync(config.uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, _file, callback) => callback(null, randomId(18)),
  }),
  limits: { fileSize: config.maxFileBytes, files: 1 },
});

function uploadSingle(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return sendError(
        res,
        413,
        `Файл слишком большой. Максимум ${Math.round(config.maxFileBytes / 1024 / 1024)} MB.`,
      );
    }
    return next(error);
  });
}

app.post(
  "/api/files",
  auth,
  rateLimit("upload", {
    windowMs: 10 * 60_000,
    max: 18,
    key: (req) => req.user.username,
  }),
  uploadSingle,
  asyncRoute(async (req, res) => {
    if (!req.file) return sendError(res, 400, "Файл не выбран.");
    const detected = sniffMime(
      req.file.path,
      req.file.mimetype,
      req.file.originalname,
    );
    const validation = validateUploadedFile(req.file, detected, { username: req.user.username, ip: requestIp(req) });
    if (!validation.ok) {
      await fsp.unlink(req.file.path).catch(() => {});
      return sendError(res, validation.status, validation.error);
    }
    const file = {
      id: req.file.filename,
      owner: req.user.username,
      chatId: null,
      kind: "pending",
      originalName: sanitizeFilename(req.file.originalname),
      mime: validation.mime,
      fileClass: validation.kind,
      size: req.file.size,
      createdAt: now(),
    };
    enrichMediaFile(file, req.file.path, db);
    db.files[file.id] = file;
    await save({ immediate: true });
    return res.status(201).json({
      id: file.id,
      placeholder: file.placeholder,
      duplicateOf: file.duplicateOf || "",
      url: `/api/files/${file.id}`,
      name: file.originalName,
      size: file.size,
      type: file.mime,
    });
  }),
);

app.post(
  "/api/avatar",
  auth,
  rateLimit("avatar-upload", {
    windowMs: 10 * 60_000,
    max: 10,
    key: (req) => req.user.username,
  }),
  uploadSingle,
  asyncRoute(async (req, res) => {
    if (!req.file) return sendError(res, 400, "Изображение не выбрано.");
    if (req.file.size > config.maxAvatarBytes) {
      await fsp.unlink(req.file.path).catch(() => {});
      return sendError(res, 413, "Аватар не должен превышать 8 MB.");
    }
    const detected = sniffMime(
      req.file.path,
      req.file.mimetype,
      req.file.originalname,
    );
    if (
      !detected.mime.startsWith("image/") ||
      detected.mime === "image/svg+xml"
    ) {
      await fsp.unlink(req.file.path).catch(() => {});
      return sendError(
        res,
        415,
        "Для аватара разрешены PNG, JPEG, GIF и WebP.",
      );
    }
    const file = {
      id: req.file.filename,
      owner: req.user.username,
      chatId: null,
      kind: "avatar",
      originalName: sanitizeFilename(req.file.originalname),
      mime: detected.mime,
      size: req.file.size,
      createdAt: now(),
    };
    enrichMediaFile(file, req.file.path, db);
    db.files[file.id] = file;
    req.user.avatar = `/api/files/${file.id}`;
    await save({ immediate: true });
    return res.status(201).json({ avatar: req.user.avatar });
  }),
);

app.get(
  "/api/files/:id",
  auth,
  asyncRoute(async (req, res) => {
    const fileId = V.id(req.params.id);
    const file = db.files[fileId];
    if (!file || !canAccessFile(file, req.user.username)) {
      return sendError(res, 404, "Файл не найден.");
    }
    const filePath = path.join(config.uploadsDir, file.id);
    try {
      await fsp.access(filePath, fs.constants.R_OK);
    } catch {
      return sendError(res, 404, "Файл отсутствует на диске.");
    }
    const sniffed = await sniffMime(filePath, file.originalName, file.mime);
    const safeMime = sniffed?.mime || file.mime || "application/octet-stream";
    const inline = /^(image|audio|video)\//.test(safeMime) && safeMime !== "image/svg+xml";
    const encodedName = encodeURIComponent(file.originalName).replace(
      /'/g,
      "%27",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", safeMime);
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
    );
    return res.sendFile(filePath);
  }),
);

app.post(
  "/api/chats/private/:username",
  auth,
  asyncRoute(async (req, res) => {
    const other = V.username(req.params.username);
    if (!db.users[other]) return sendError(res, 404, "Пользователь не найден.");
    if (other === req.user.username)
      return sendError(res, 400, "Используйте Избранное для сообщений себе.");
    if (isBlockedBetween(req.user.username, other)) {
      return sendError(res, 403, "Личный чат недоступен из-за блокировки.");
    }
    let chat = Object.values(db.chats).find(
      (candidate) =>
        candidate.type === "private" &&
        candidate.members.length === 2 &&
        candidate.members.includes(req.user.username) &&
        candidate.members.includes(other),
    );
    if (!chat) {
      const chatId = `private_${randomId(12)}`;
      chat = {
        id: chatId,
        type: "private",
        members: [req.user.username, other],
        admins: [],
        owner: "",
        createdAt: now(),
        pinned: [],
        muted: {},
        permissions: { write: true, invite: false, avatar: false },
      };
      db.chats[chatId] = chat;
      db.messages[chatId] = [];
      await save({ immediate: true });
    }
    return res.json({ chat: chatSafe(chat, req.user.username) });
  }),
);

app.post(
  "/api/chats/group",
  auth,
  asyncRoute(async (req, res) => {
    const title = V.text(req.body?.title, 80, "Новая группа").trim();
    if (!title) return sendError(res, 400, "Введите название группы.");
    const requestedMembers = V.stringArray(req.body?.members, 200, 32)
      .map(V.username)
      .filter((username) => db.users[username]);
    const members = [...new Set([req.user.username, ...requestedMembers])];
    const chatId = `group_${randomId(12)}`;
    const channel = req.body?.channel === true;
    const chat = {
      id: chatId,
      type: channel ? "channel" : "group",
      title,
      avatar: "",
      members,
      admins: [req.user.username],
      owner: req.user.username,
      createdAt: now(),
      pinned: [],
      muted: {},
      description: V.text(req.body?.description, 800),
      permissions: {
        write: channel ? false : req.body?.permissions?.write !== false,
        sendFiles: req.body?.permissions?.sendFiles !== false,
        invite: req.body?.permissions?.invite !== false,
        avatar: req.body?.permissions?.avatar === true,
        pin: req.body?.permissions?.pin !== false,
        deleteOthers: req.body?.permissions?.deleteOthers === true,
        slowModeSeconds: Math.max(0, Math.min(3600, Number(req.body?.permissions?.slowModeSeconds || 0))),
        readOnly: channel || req.body?.permissions?.readOnly === true,
        public: req.body?.permissions?.public === true,
        slug: V.text(req.body?.permissions?.slug || "", 64).toLowerCase().replace(/[^a-z0-9_-]/g, ""),
      },
    };
    db.chats[chatId] = chat;
    db.messages[chatId] = [];
    await save({ immediate: true });
    return res.status(201).json({ chat: chatSafe(chat, req.user.username) });
  }),
);

app.get("/api/chats", auth, (req, res) => {
  ensureSaved(req.user.username);
  const deleted = db.deletedChats[req.user.username] || [];
  const chats = Object.values(db.chats)
    .filter(
      (chat) =>
        chat.members.includes(req.user.username) && !deleted.includes(chat.id),
    )
    .map((chat) => chatSafe(chat, req.user.username))
    .sort(
      (first, second) =>
        (second.last?.createdAt || second.createdAt) -
        (first.last?.createdAt || first.createdAt),
    );
  return res.json({ chats });
});



app.post("/api/devices/e2ee/current", auth, asyncRoute(async (req, res) => {
  const device = rememberE2eeDevice(req.user, req.body || {}, req.session);
  if (!device) return sendError(res, 400, "Некорректный E2EE ключ устройства.");
  recordSecurityEvent("e2ee_device_resync", {
    username: req.user.username,
    ip: requestIp(req),
    message: "Ключ E2EE устройства пересинхронизирован.",
    meta: { deviceId: device.id },
  });
  await save({ immediate: true });
  return res.json({ ok: true, device, devices: publicE2eeDevicesForUser(req.user.username) });
}));

app.get("/api/chats/:id/e2ee-devices", auth, (req, res) => {
  const chat = getChatForUser(req.params.id, req.user.username);
  if (!chat) return sendError(res, 404, "Чат не найден.");
  const devices = [];
  for (const member of chat.members) devices.push(...publicE2eeDevicesForUser(member));
  return res.json({ chatId: chat.id, devices, members: chat.members });
});

app.get("/api/sync/pull", auth, (req, res) => {
  const cursor = Number(req.query.cursor || req.query.since || 0);
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
  const deviceId = V.text(req.query.deviceId || req.headers["x-nightvault-device"] || "default", 120);
  return res.json(syncEngine.pullEvents({ username: req.user.username, deviceId }, { cursor, limit }));
});

app.post("/api/sync/push", auth, asyncRoute(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : Array.isArray(req.body?.events) ? req.body.events : [];
  const deviceId = V.text(req.body?.deviceId || req.headers["x-nightvault-device"] || "default", 120);
  const clientId = V.text(req.body?.clientId || req.headers["x-nightvault-client"] || "client", 120);
  const result = await syncEngine.pushEvents(items, { username: req.user.username, deviceId, clientId });
  return res.json(result);
}));

app.get("/api/sync/history", auth, (req, res) => {
  return res.json(syncEngine.history(req.user.username));
});

app.put(
  "/api/chats/:id",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat) return sendError(res, 404, "Чат не найден.");
    if (chat.type === "private" || chat.type === "saved") {
      return sendError(res, 400, "Параметры этого чата нельзя изменять.");
    }
    const isAdmin = chat.admins.includes(req.user.username);
    const canEditProfile = isAdmin || chat.permissions?.avatar === true;
    const canInvite = isAdmin || chat.permissions?.invite !== false;

    if (
      req.body?.title !== undefined ||
      req.body?.description !== undefined ||
      req.body?.avatar !== undefined
    ) {
      if (!canEditProfile)
        return sendError(res, 403, "Недостаточно прав для изменения группы.");
      if (req.body.title !== undefined) {
        const title = V.text(req.body.title, 80).trim();
        if (!title)
          return sendError(res, 400, "Название не может быть пустым.");
        chat.title = title;
      }
      if (req.body.description !== undefined)
        chat.description = V.text(req.body.description, 800);
      if (req.body.avatar !== undefined) {
        const fileId = normalizedFileReference(req.body.avatar);
        const file = db.files[fileId];
        if (
          !file ||
          file.owner !== req.user.username ||
          !file.mime.startsWith("image/")
        ) {
          return sendError(res, 400, "Недопустимый файл аватара.");
        }
        file.kind = "avatar";
        file.chatId = chat.id;
        chat.avatar = `/api/files/${file.id}`;
      }
    }

    if (req.body?.addMembers !== undefined) {
      if (!canInvite)
        return sendError(res, 403, "Приглашение участников запрещено.");
      const additions = V.stringArray(req.body.addMembers, 100, 32)
        .map(V.username)
        .filter((username) => db.users[username]);
      chat.members = [...new Set([...chat.members, ...additions])];
    }

    if (req.body?.permissions !== undefined || req.body?.admins !== undefined) {
      if (!isAdmin)
        return sendError(res, 403, "Требуются права администратора.");
      if (req.body.permissions) {
        chat.permissions = {
          ...chat.permissions,
          write: req.body.permissions.write !== false,
          invite: req.body.permissions.invite !== false,
          avatar: req.body.permissions.avatar === true,
        };
        if (chat.type === "channel") chat.permissions.write = false;
      }
      if (Array.isArray(req.body.admins)) {
        chat.admins = [...new Set(req.body.admins.map(V.username))].filter(
          (username) => chat.members.includes(username),
        );
        if (!chat.admins.includes(chat.owner)) chat.admins.unshift(chat.owner);
      }
    }

    recordSyncEvent("update", "chat", chat.id, chat.id, { title: chat.title, members: chat.members.length });
    await save({ immediate: true });
    emitChat(chat, (viewer) => ({
      type: "chat_update",
      chat: chatSafe(chat, viewer),
    }));
    return res.json({ chat: chatSafe(chat, req.user.username) });
  }),
);

app.post(
  "/api/chats/:id/leave",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat || !["group", "channel"].includes(chat.type)) {
      return sendError(res, 404, "Группа не найдена.");
    }
    if (chat.owner === req.user.username && chat.members.length > 1) {
      return sendError(res, 400, "Сначала передайте права владельца.");
    }
    chat.members = chat.members.filter(
      (member) => member !== req.user.username,
    );
    chat.admins = chat.admins.filter((admin) => admin !== req.user.username);
    if (!chat.members.length) {
      delete db.chats[chat.id];
      delete db.messages[chat.id];
    }
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.delete(
  "/api/chats/:id/members/:username",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat || !["group", "channel"].includes(chat.type)) {
      return sendError(res, 404, "Группа не найдена.");
    }
    if (!chat.admins.includes(req.user.username))
      return sendError(res, 403, "Требуются права администратора.");
    const target = V.username(req.params.username);
    if (!chat.members.includes(target))
      return sendError(res, 404, "Участник не найден.");
    if (target === chat.owner)
      return sendError(res, 400, "Нельзя удалить владельца.");
    chat.members = chat.members.filter((member) => member !== target);
    chat.admins = chat.admins.filter((admin) => admin !== target);
    await save({ immediate: true });
    emitChat(chat, (viewer) => ({
      type: "chat_update",
      chat: chatSafe(chat, viewer),
    }));
    emitToUser(target, { type: "chat_removed", chatId: chat.id });
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/chats/:id/owner",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat || !["group", "channel"].includes(chat.type)) {
      return sendError(res, 404, "Группа не найдена.");
    }
    if (chat.owner !== req.user.username)
      return sendError(res, 403, "Только владелец может передать права.");
    const target = V.username(req.body?.username);
    if (!chat.members.includes(target))
      return sendError(res, 400, "Новый владелец должен быть участником.");
    chat.owner = target;
    if (!chat.admins.includes(target)) chat.admins.push(target);
    await save({ immediate: true });
    emitChat(chat, (viewer) => ({
      type: "chat_update",
      chat: chatSafe(chat, viewer),
    }));
    return res.json({ chat: chatSafe(chat, req.user.username) });
  }),
);

app.post(
  "/api/chats/:id/delete",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat) return sendError(res, 404, "Чат не найден.");
    db.deletedChats[req.user.username] =
      db.deletedChats[req.user.username] || [];
    if (!db.deletedChats[req.user.username].includes(chat.id)) {
      db.deletedChats[req.user.username].push(chat.id);
    }
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/chats/:id/mute",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat) return sendError(res, 404, "Чат не найден.");
    chat.muted = chat.muted || {};
    chat.muted[req.user.username] = req.body?.muted === true;
    await save({ immediate: true });
    return res.json({ ok: true });
  }),
);

app.get(
  "/api/chats/:id/export",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat) return sendError(res, 404, "Чат не найден.");
    const exported = buildChatExport({
      chat,
      messages: db.messages[chat.id] || [],
      viewer: req.user.username,
      chatSafe,
      safeMessage,
      messageVisibleTo,
    });
    recordSecurityEvent("chat_export", {
      username: req.user.username,
      ip: requestIp(req),
      message: "Экспортирован отдельный чат.",
      meta: { chatId: chat.id, messages: exported.counts.messages },
    });
    return res.json({ export: exported });
  }),
);

app.get("/api/chats/:id/messages", auth, (req, res) => {
  const chat = getChatForUser(req.params.id, req.user.username);
  if (!chat) return sendError(res, 404, "Чат не найден.");
  const limit = Math.trunc(V.number(req.query.limit, 1, 100, 50));
  let messages = (db.messages[chat.id] || []).filter((message) =>
    messageVisibleTo(message, req.user.username),
  );
  const before = V.text(req.query.before, 96);
  if (before) {
    const index = messages.findIndex((message) => message.id === before);
    if (index >= 0) messages = messages.slice(0, index);
  }
  const page = messages.slice(-limit);
  return res.json({
    messages: page.map(safeMessage),
    nextCursor: messages.length > page.length ? page[0]?.id || null : null,
  });
});

app.post(
  "/api/chats/:id/messages",
  auth,
  rateLimit("messages", {
    windowMs: 60_000,
    max: 90,
    key: (req) => req.user.username,
  }),
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat) return sendError(res, 404, "Чат не найден.");
    if (chat.type === "channel" && !chat.admins.includes(req.user.username)) {
      return sendError(
        res,
        403,
        "Публиковать в канале могут только администраторы.",
      );
    }
    if (
      chat.type === "group" &&
      chat.permissions?.write === false &&
      !chat.admins.includes(req.user.username)
    ) {
      return sendError(
        res,
        403,
        "Отправка сообщений запрещена настройками группы.",
      );
    }
    if (
      chat.type === "private" &&
      isBlockedBetween(
        req.user.username,
        chat.members.find((member) => member !== req.user.username),
      )
    ) {
      return sendError(res, 403, "Отправка недоступна из-за блокировки.");
    }

    const e2ee = normalizeE2eeEnvelope(req.body?.e2ee);
    const text = e2ee ? V.text(req.body?.text || "🔐 Зашифрованное сообщение", 8000).trimEnd() : V.text(req.body?.text, 8000).trimEnd();
    let attachment = null;
    if (req.body?.attachment?.id) {
      const fileId = V.id(req.body.attachment.id);
      attachment = bindUploadedFile(fileId, chat.id, req.user.username);
      if (!attachment)
        return sendError(
          res,
          400,
          "Файл не найден или уже привязан к другому чату.",
        );
      if (
        req.body.attachment.voice === true &&
        attachment.type.startsWith("audio/")
      ) {
        attachment.voice = true;
        attachment.duration = Math.trunc(
          V.number(req.body.attachment.duration, 0, 24 * 60 * 60, 0),
        );
      }
    }
    if (!text && !attachment && !e2ee) return sendError(res, 400, "Сообщение пустое.");

    const replyTo = V.id(req.body?.replyTo);
    const replySource = replyTo
      ? (db.messages[chat.id] || []).find(
          (message) => message.id === replyTo && messageVisibleTo(message, req.user.username),
        )
      : null;
    if (replyTo && !replySource) {
      return sendError(res, 400, "Сообщение для ответа не найдено.");
    }
    const mentions = e2ee ? [] : extractMentionsForChat(text, chat, req.user.username, V.mentions);
    const ttlSeconds = Math.trunc(
      V.number(req.body?.ttl, 0, 7 * 24 * 60 * 60, 0),
    );
    const deliveredTo = [req.user.username];
    for (const member of chat.members) {
      if (isOnline(member) && !deliveredTo.includes(member))
        deliveredTo.push(member);
    }
    const message = {
      id: randomId(12),
      chatId: chat.id,
      from: req.user.username,
      text,
      e2ee,
      attachment,
      replyTo: replyTo || null,
      replyPreview: buildReplyPreview(replySource, V.text),
      mentions,
      reactions: {},
      editedAt: null,
      createdAt: now(),
      deliveredTo,
      readBy: [req.user.username],
      deletedFor: [],
      deletedForAll: false,
      selfDestructAt: ttlSeconds ? now() + ttlSeconds * 1000 : null,
    };
    db.messages[chat.id] = db.messages[chat.id] || [];
    db.messages[chat.id].push(message);
    for (const member of chat.members) {
      db.deletedChats[member] = (db.deletedChats[member] || []).filter(
        (chatId) => chatId !== chat.id,
      );
    }
    await save({ immediate: true });
    emitChat(chat, (viewer) => ({
      type: "message",
      message: safeMessage(message),
      chat: chatSafe(chat, viewer),
    }));
    return res.status(201).json({ message: safeMessage(message) });
  }),
);

app.put(
  "/api/messages/:id",
  auth,
  asyncRoute(async (req, res) => {
    const found = findVisibleMessageForUser(V.id(req.params.id), req.user.username);
    if (!found || !canUserMutateMessage(found.message, found.chat, req.user.username)) {
      return sendError(res, 404, "Сообщение не найдено.");
    }
    const e2ee = normalizeE2eeEnvelope(req.body?.e2ee);
    const text = e2ee ? V.text(req.body?.text || "🔐 Зашифрованное сообщение", 8000).trimEnd() : V.text(req.body?.text, 8000).trimEnd();
    if (!text && !found.message.attachment && !e2ee)
      return sendError(res, 400, "Сообщение не может быть пустым.");
    found.message.text = text;
    found.message.e2ee = e2ee || null;
    found.message.mentions = e2ee ? [] : extractMentionsForChat(text, found.chat, req.user.username, V.mentions);
    found.message.editedAt = now();
    recordSyncEvent("update", "message", found.message.id, found.chat.id, { message: safeMessage(found.message) });
    await save({ immediate: true });
    emitChat(found.chat, {
      type: "message_update",
      message: safeMessage(found.message),
    });
    return res.json({ message: safeMessage(found.message) });
  }),
);

app.delete(
  "/api/messages/:id",
  auth,
  asyncRoute(async (req, res) => {
    const found = findVisibleMessageForUser(V.id(req.params.id), req.user.username);
    if (!found) {
      return sendError(res, 404, "Сообщение не найдено.");
    }
    const deleteForAll = req.query.all === "1";
    if (deleteForAll) {
      if (!canUserMutateMessage(found.message, found.chat, req.user.username, { allowAdmins: true })) {
        return sendError(res, 403, "Недостаточно прав для удаления у всех.");
      }
      found.message.deletedForAll = true;
    } else {
      found.message.deletedFor = found.message.deletedFor || [];
      if (!found.message.deletedFor.includes(req.user.username)) {
        found.message.deletedFor.push(req.user.username);
      }
    }
    await save({ immediate: true });
    emitChat(found.chat, {
      type: "message_delete",
      id: found.message.id,
      all: found.message.deletedForAll,
      user: req.user.username,
    });
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/messages/:id/react",
  auth,
  rateLimit("reactions", {
    windowMs: 60_000,
    max: 120,
    key: (req) => req.user.username,
  }),
  asyncRoute(async (req, res) => {
    const found = findVisibleMessageForUser(V.id(req.params.id), req.user.username);
    if (!found) {
      return sendError(res, 404, "Сообщение не найдено.");
    }
    const emoji = V.reaction(req.body?.emoji);
    if (!emoji) return sendError(res, 400, "Эта реакция не поддерживается.");
    found.message.reactions = found.message.reactions || {};
    found.message.reactions[emoji] = found.message.reactions[emoji] || [];
    const users = found.message.reactions[emoji];
    found.message.reactions[emoji] = users.includes(req.user.username)
      ? users.filter((username) => username !== req.user.username)
      : [...users, req.user.username];
    if (!found.message.reactions[emoji].length) {
      delete found.message.reactions[emoji];
    }
    await save({ immediate: true });
    emitChat(found.chat, {
      type: "message_update",
      message: safeMessage(found.message),
    });
    return res.json({ message: safeMessage(found.message) });
  }),
);

app.post(
  "/api/messages/:id/pin",
  auth,
  asyncRoute(async (req, res) => {
    const found = findVisibleMessageForUser(V.id(req.params.id), req.user.username);
    if (!found) {
      return sendError(res, 404, "Сообщение не найдено.");
    }
    if (
      ["group", "channel"].includes(found.chat.type) &&
      !found.chat.admins.includes(req.user.username)
    ) {
      return sendError(
        res,
        403,
        "Закреплять сообщения могут только администраторы.",
      );
    }
    found.chat.pinned = found.chat.pinned || [];
    if (!found.chat.pinned.includes(found.message.id))
      found.chat.pinned.push(found.message.id);
    await save({ immediate: true });
    emitChat(found.chat, (viewer) => ({
      type: "chat_update",
      chat: chatSafe(found.chat, viewer),
    }));
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/chats/:id/read",
  auth,
  asyncRoute(async (req, res) => {
    const chat = getChatForUser(req.params.id, req.user.username);
    if (!chat) return sendError(res, 404, "Чат не найден.");
    const throughId = V.id(req.body?.through);
    const messages = db.messages[chat.id] || [];
    const throughIndex = throughId
      ? messages.findIndex((message) => message.id === throughId)
      : messages.length - 1;
    const stop = throughIndex >= 0 ? throughIndex : messages.length - 1;
    for (let index = 0; index <= stop; index += 1) {
      const message = messages[index];
      if (!messageVisibleTo(message, req.user.username)) continue;
      message.deliveredTo = message.deliveredTo || [];
      message.readBy = message.readBy || [];
      if (!message.deliveredTo.includes(req.user.username))
        message.deliveredTo.push(req.user.username);
      if (!message.readBy.includes(req.user.username))
        message.readBy.push(req.user.username);
    }
    await save({ immediate: true });
    emitChat(chat, {
      type: "read",
      chatId: chat.id,
      user: req.user.username,
      through: throughId || messages[stop]?.id || null,
    });
    return res.json({ ok: true });
  }),
);

app.get("/api/search-global", auth, (req, res) => {
  const query = V.text(req.query.q, 120).trim().toLowerCase();
  if (query.length < 2) return res.json({ results: [] });
  const output = [];
  for (const chat of Object.values(db.chats)) {
    if (!chat.members.includes(req.user.username)) continue;
    for (const message of db.messages[chat.id] || []) {
      if (!messageVisibleTo(message, req.user.username)) continue;
      if (
        String(message.text || "")
          .toLowerCase()
          .includes(query) ||
        String(message.attachment?.name || "")
          .toLowerCase()
          .includes(query)
      ) {
        output.push({
          chat: chatSafe(chat, req.user.username),
          message: safeMessage(message),
        });
      }
      if (output.length >= 100) break;
    }
    if (output.length >= 100) break;
  }
  return res.json({ results: output });
});

app.post("/api/ws-ticket", auth, (req, res) => {
  const ticket = randomToken(24);
  wsTickets.set(ticket, {
    username: req.user.username,
    sessionId: req.session.id,
    expiresAt: now() + 30_000,
  });
  return res.json({ ticket, expiresIn: 30 });
});


// NightVault 1.3.9 Messenger Features Update: notes, links and tester diagnostics endpoints
function boundedArray(value, max = 500) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}
function sanitizeNote(item = {}) {
  return {
    id: V.text(item.id, 80) || randomId(10),
    title: V.text(item.title || "Без названия", 140),
    body: V.text(item.body || "", 20000),
    pinned: Boolean(item.pinned),
    syncState: V.text(item.syncState || "synced", 32),
    createdAt: Number(item.createdAt || now()),
    updatedAt: Number(item.updatedAt || now()),
  };
}
function sanitizeLink(item = {}) {
  return {
    id: V.text(item.id, 80) || randomId(10),
    url: V.text(item.url || "", 2048),
    title: V.text(item.title || item.url || "Ссылка", 180),
    description: V.text(item.description || "", 1200),
    syncState: V.text(item.syncState || "synced", 32),
    createdAt: Number(item.createdAt || now()),
  };
}
app.get("/api/notes", auth, (req, res) => {
  res.json({ notes: boundedArray(db.notes?.[req.user.username] || [], 500) });
});
app.put("/api/notes", auth, asyncRoute(async (req, res) => {
  db.notes = db.notes || {};
  db.notes[req.user.username] = boundedArray(req.body?.notes, 500).map(sanitizeNote);
  recordSyncEvent("update", "notes", req.user.username, "", { count: db.notes[req.user.username].length });
  await save({ immediate: true });
  res.json({ notes: db.notes[req.user.username] });
}));
app.delete("/api/notes/:id", auth, asyncRoute(async (req, res) => {
  db.notes = db.notes || {};
  db.notes[req.user.username] = boundedArray(db.notes[req.user.username], 500).filter((item) => item.id !== req.params.id);
  recordSyncEvent("delete", "note", req.params.id, "", {});
  await save({ immediate: true });
  res.json({ ok: true });
}));
app.get("/api/links", auth, (req, res) => {
  res.json({ links: boundedArray(db.links?.[req.user.username] || [], 500) });
});
app.put("/api/links", auth, asyncRoute(async (req, res) => {
  db.links = db.links || {};
  db.links[req.user.username] = boundedArray(req.body?.links, 500).map(sanitizeLink);
  recordSyncEvent("update", "links", req.user.username, "", { count: db.links[req.user.username].length });
  await save({ immediate: true });
  res.json({ links: db.links[req.user.username] });
}));
app.post("/api/client-report", auth, asyncRoute(async (req, res) => {
  db.clientReports = db.clientReports || [];
  db.clientReports.push({ id: randomId(10), username: req.user.username, createdAt: now(), type: V.text(req.body?.type || "tester", 64), message: V.text(req.body?.message || "", 1200), meta: req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {} });
  db.clientReports = db.clientReports.slice(-240);
  await save({ immediate: true });
  res.json({ ok: true });
}));


// NightVault 1.3.5: E2EE trust, debug report, notifications, search, media and group governance.
app.get("/api/chats/:id/e2ee-trust", auth, (req, res) => {
  const chat = getChatForUser(req.params.id, req.user.username);
  if (!chat) return sendError(res, 404, "Чат не найден.");
  const devices = [];
  for (const member of chat.members || []) devices.push(...listTrustedDevices(db, member));
  return res.json({ chatId: chat.id, safetyNumber: safetyNumberForChat(chat, db.users), devices, strictMode: req.user.settings?.strictE2ee === true });
});

app.post("/api/devices/:id/trust", auth, asyncRoute(async (req, res) => {
  const deviceId = V.text(req.params.id, 120);
  const item = setTrust(db, req.user.username, deviceId, req.body?.trusted !== false);
  await save({ immediate: true });
  return res.json({ ok: true, device: item, devices: listTrustedDevices(db, req.user.username) });
}));

app.post("/api/devices/:id/rotate-key", auth, asyncRoute(async (req, res) => {
  const deviceId = V.text(req.params.id, 120);
  const publicKey = normalizeE2eePublicKey(req.body?.publicKey);
  if (!publicKey) return sendError(res, 400, "Неверный публичный ключ устройства.");
  const result = rotateDeviceKey(db, req.user.username, deviceId, publicKey);
  Notifications.notify(db, req.user.username, "key_rotated", { deviceId, fingerprint: result.next });
  await save({ immediate: true });
  return res.json({ ok: true, ...result });
}));

app.get("/api/e2ee/fingerprint/:username", auth, (req, res) => {
  const username = V.username(req.params.username);
  const user = db.users[username];
  if (!user) return sendError(res, 404, "Пользователь не найден.");
  return res.json({ username, devices: Object.values(user.e2eeDevices || {}).map((device) => ({ id: device.id, fingerprint: fingerprintForPublicKey(device.publicKey), device: device.device || "NightVault device" })) });
});

app.post("/api/e2ee/recovery-key", auth, asyncRoute(async (req, res) => {
  const bundle = V.text(req.body?.encryptedBundle, 50000);
  if (!bundle) return sendError(res, 400, "Encrypted key bundle отсутствует.");
  req.user.e2eeRecovery = { encryptedBundle: bundle, updatedAt: now(), warning: "Без recovery key старые E2EE сообщения не восстановятся." };
  recordSecurityEvent("e2ee_recovery_updated", { username: req.user.username, severity: "info", message: "Обновлён encrypted E2EE recovery bundle." });
  await save({ immediate: true });
  return res.json({ ok: true, updatedAt: req.user.e2eeRecovery.updatedAt });
}));

app.get("/api/e2ee/key-events", auth, (req, res) => {
  return res.json({ events: (db.keyEvents || []).filter((event) => event.username === req.user.username).slice(-100).reverse() });
});

app.get("/api/notifications/settings", auth, (req, res) => res.json({ settings: Notifications.settingsFor(db, req.user.username) }));
app.put("/api/notifications/settings", auth, asyncRoute(async (req, res) => {
  const settings = Notifications.updateSettings(db, req.user.username, {
    enabled: req.body?.enabled !== false,
    showText: req.body?.showText !== false,
    sound: V.text(req.body?.sound || "default", 80),
    quietHours: req.body?.quietHours || null,
    chatMutes: req.body?.chatMutes && typeof req.body.chatMutes === "object" ? req.body.chatMutes : {},
  });
  await save({ immediate: true });
  return res.json({ settings });
}));
app.get("/api/notifications", auth, (req, res) => res.json({ notifications: Notifications.list(db, req.user.username, req.query.limit) }));
app.post("/api/notifications/read", auth, asyncRoute(async (req, res) => {
  const count = Notifications.markRead(db, req.user.username, Array.isArray(req.body?.ids) ? req.body.ids : []);
  await save({ immediate: true });
  return res.json({ ok: true, count });
}));

app.put("/api/presence", auth, asyncRoute(async (req, res) => {
  const presence = Presence.setPresence(db, req.user.username, { mode: req.body?.mode, statusText: req.body?.statusText });
  emitToUser(req.user.username, { type: "presence", presence });
  await save({ immediate: true });
  return res.json({ presence });
}));

app.get("/api/search/fts", auth, (req, res) => {
  return res.json({ results: SearchIndex.searchSqlite(openSqlite(), req.user.username, req.query.q, req.query.limit) });
});
app.post("/api/search/reindex", auth, asyncRoute(async (_req, res) => {
  const result = SearchIndex.rebuildSearchIndex(openSqlite(), db);
  await save({ immediate: true });
  return res.json(result);
}));

app.get("/api/files/:id/meta", auth, (req, res) => {
  const fileId = V.id(req.params.id);
  const file = db.files[fileId];
  if (!file || !canAccessFile(file, req.user.username)) return sendError(res, 404, "Файл не найден.");
  return res.json({ file: { id: file.id, name: file.originalName, mime: file.mime, size: file.size, hash: file.hash || "", placeholder: file.placeholder || null, duplicateOf: file.duplicateOf || "" } });
});
app.post("/api/files/cleanup", auth, asyncRoute(async (req, res) => {
  if (req.user.username !== "admin" && req.user.username !== "__admin_test") return sendError(res, 403, "Только администратор тестовой среды.");
  const removed = cleanupOrphanFiles(db, (id) => fs.unlinkSync(path.join(config.uploadsDir, id)));
  await save({ immediate: true });
  return res.json({ ok: true, removed });
}));

app.post("/api/chats/:id/invites", auth, asyncRoute(async (req, res) => {
  const chat = getChatForUser(req.params.id, req.user.username);
  if (!chat || !["group", "channel"].includes(chat.type)) return sendError(res, 404, "Группа не найдена.");
  if (chat.owner !== req.user.username && !(chat.admins || []).includes(req.user.username) && chat.permissions?.invite === false) return sendError(res, 403, "Нет прав создавать приглашения.");
  db.inviteLinks = db.inviteLinks || {};
  const code = randomToken(18);
  db.inviteLinks[code] = { code, chatId: chat.id, createdBy: req.user.username, expiresAt: Number(req.body?.expiresAt || 0), maxUses: Math.max(0, Math.min(10000, Number(req.body?.maxUses || 0))), uses: 0, createdAt: now() };
  db.groupAudit = Array.isArray(db.groupAudit) ? db.groupAudit : [];
  db.groupAudit.push({ id: randomId(10), chatId: chat.id, actor: req.user.username, action: "invite_created", value: { code }, createdAt: now() });
  await save({ immediate: true });
  return res.status(201).json({ invite: db.inviteLinks[code] });
}));

app.post("/api/chats/join/:code", auth, asyncRoute(async (req, res) => {
  const invite = db.inviteLinks?.[V.text(req.params.code, 120)];
  if (!invite) return sendError(res, 404, "Приглашение не найдено.");
  if (invite.expiresAt && invite.expiresAt < now()) return sendError(res, 410, "Приглашение истекло.");
  if (invite.maxUses && invite.uses >= invite.maxUses) return sendError(res, 410, "Лимит приглашения исчерпан.");
  const chat = db.chats[invite.chatId];
  if (!chat) return sendError(res, 404, "Группа удалена.");
  chat.banned = chat.banned || [];
  if (chat.banned.includes(req.user.username)) return sendError(res, 403, "Вы заблокированы в группе.");
  chat.joinRequests = chat.joinRequests || [];
  if (chat.permissions?.joinRequests) {
    if (!chat.joinRequests.includes(req.user.username)) chat.joinRequests.push(req.user.username);
    return res.json({ ok: true, pending: true });
  }
  chat.members = [...new Set([...(chat.members || []), req.user.username])];
  invite.uses += 1;
  db.groupAudit.push({ id: randomId(10), chatId: chat.id, actor: req.user.username, action: "joined_by_invite", value: { code: invite.code }, createdAt: now() });
  await save({ immediate: true });
  return res.json({ ok: true, chat: chatSafe(chat, req.user.username) });
}));

app.get("/api/chats/:id/audit", auth, (req, res) => {
  const chat = getChatForUser(req.params.id, req.user.username);
  if (!chat) return sendError(res, 404, "Чат не найден.");
  if (chat.owner !== req.user.username && !(chat.admins || []).includes(req.user.username)) return sendError(res, 403, "Нужны права администратора.");
  return res.json({ events: (db.groupAudit || []).filter((event) => event.chatId === chat.id).slice(-200).reverse() });
});

app.post("/api/chats/:id/ban/:username", auth, asyncRoute(async (req, res) => {
  const chat = getChatForUser(req.params.id, req.user.username);
  const target = V.username(req.params.username);
  if (!chat || !["group", "channel"].includes(chat.type)) return sendError(res, 404, "Группа не найдена.");
  if (chat.owner !== req.user.username && !(chat.admins || []).includes(req.user.username)) return sendError(res, 403, "Нужны права администратора.");
  chat.banned = [...new Set([...(chat.banned || []), target])];
  chat.members = (chat.members || []).filter((username) => username !== target);
  db.groupAudit.push({ id: randomId(10), chatId: chat.id, actor: req.user.username, action: "ban", value: { target }, createdAt: now() });
  await save({ immediate: true });
  return res.json({ ok: true, banned: chat.banned });
}));

app.get("/api/debug-report", auth, (req, res) => {
  const readiness = collectReadinessReport(db, config);
  const report = buildDebugReport({ db, sqliteStatus: sqliteStatus(), readiness, serverStatus: { ok: true, time: now(), users: Object.keys(db.users || {}).length } });
  return res.json(report);
});

app.use((error, req, res, _next) => {
  log("error", "request_failed", {
    method: req.method,
    path: req.path,
    message: sanitizeLogMessage(error.message),
  });
  if (error instanceof SyntaxError && "body" in error) {
    return sendError(res, 400, "Некорректный JSON.");
  }
  return sendError(res, 500, "Внутренняя ошибка сервера.");
});

function createHttpServer() {
  if (config.tlsCertPath && config.tlsKeyPath) {
    return https.createServer(
      {
        cert: fs.readFileSync(config.tlsCertPath),
        key: fs.readFileSync(config.tlsKeyPath),
        minVersion: "TLSv1.2",
      },
      app,
    );
  }
  return http.createServer(app);
}

const server = createHttpServer();
const wss = new WebSocket.Server({ server, maxPayload: 64 * 1024 });

function markDelivered(username) {
  for (const chat of Object.values(db.chats)) {
    if (!chat.members.includes(username)) continue;
    const messages = (db.messages[chat.id] || []).slice(-200);
    for (const message of messages) {
      if (message.from === username || !messageVisibleTo(message, username)) continue;
      message.deliveredTo = message.deliveredTo || [];
      if (!message.deliveredTo.includes(username)) {
        message.deliveredTo.push(username);
        emitChat(chat, {
          type: "delivered",
          chatId: chat.id,
          messageId: message.id,
          user: username,
        });
      }
    }
  }
  save();
}

wss.on("connection", (ws, req) => {
  if (!originAllowedForWs(req.headers.origin || "")) {
    ws.close(1008, "bad origin");
    return;
  }
  let ticket = "";
  try {
    const url = new URL(req.url, "http://localhost");
    ticket = url.searchParams.get("ticket") || "";
  } catch {}
  const ticketData = wsTickets.get(ticket);
  wsTickets.delete(ticket);
  if (!ticketData || ticketData.expiresAt <= now()) {
    ws.close(1008, "invalid ticket");
    return;
  }
  const activeSession = Object.values(db.sessions).some(
    (session) =>
      session.id === ticketData.sessionId &&
      session.username === ticketData.username &&
      session.refreshExpiresAt > now(),
  );
  if (!activeSession || !db.users[ticketData.username]) {
    ws.close(1008, "session expired");
    return;
  }

  const username = ticketData.username;
  sockets.set(username, sockets.get(username) || new Set());
  sockets.get(username).add(ws);
  ws.isAlive = true;
  ws.lastTypingAt = 0;
  db.users[username].lastSeen = now();
  save();
  markDelivered(username);

  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("message", (buffer) => {
    if (buffer.length > 64 * 1024) return;
    try {
      const payload = JSON.parse(buffer.toString("utf8"));
      if (payload.type === "presence") {
        const presence = Presence.setPresence(db, username, { mode: payload.mode, statusText: payload.statusText });
        ws.send(JSON.stringify({ type: "presence_ack", presence }));
        return;
      }
      if (["read_ack", "delivery_ack"].includes(payload.type)) {
        const found = findVisibleMessageForUser(V.text(payload.messageId, 96), username);
        if (found) {
          const list = payload.type === "read_ack" ? (found.message.readBy ||= []) : (found.message.deliveredTo ||= []);
          if (!list.includes(username)) list.push(username);
          emitChat(found.chat, { type: payload.type, chatId: found.chat.id, messageId: found.message.id, user: username, at: now() });
          save();
        }
        return;
      }
      if (payload.type !== "typing") return;
      if (now() - ws.lastTypingAt < 500) return;
      ws.lastTypingAt = now();
      const chat = getChatForUser(V.text(payload.chatId, 96), username);
      if (!chat) return;
      for (const member of chat.members) {
        if (member !== username) {
          emitToUser(member, {
            type: "typing",
            chatId: chat.id,
            user: username,
            active: payload.active === true,
            ttl: 3500,
          });
        }
      }
    } catch {}
  });
  ws.on("close", () => {
    sockets.get(username)?.delete(ws);
    if (!sockets.get(username)?.size) sockets.delete(username);
    if (db.users[username]) {
      db.users[username].lastSeen = now();
      save();
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, 30_000);
heartbeat.unref();

function broadcastAdminEvent(payload = {}) {
  const event = {
    type: payload.type === "maintenance" ? "server:maintenance" : "admin:broadcast",
    broadcastType: payload.type || "info",
    text: String(payload.text || payload.message || "").slice(0, 500),
    maintenance: payload.maintenance || null,
    createdAt: Date.now(),
  };
  for (const username of Object.keys(db.users || {})) emitToUser(username, event);
  log("info", "admin_broadcast", { type: event.broadcastType, text: event.text });
  return event;
}
function getRuntimeMetrics() {
  return {
    uptime: Date.now() - runtimeMetrics.startedAt,
    sockets: [...sockets.values()].reduce((sum, set) => sum + set.size, 0),
    requestsPerMinute: runtimeMetrics.requests.length,
    errorsPerMinute: runtimeMetrics.errors.length,
    messagesPerMinute: runtimeMetrics.messages.filter((x) => Date.now() - x.t < 60_000).length,
    filesPerMinute: runtimeMetrics.files.filter((x) => Date.now() - x.t < 60_000).length,
  };
}

async function shutdown(signal) {
  log("info", "shutdown", { signal });
  clearInterval(heartbeat);
  wss.close();
  server.close();
  await flush().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  log("error", "uncaught_exception", {
    message: error.message,
    stack: error.stack,
  });
});
process.on("unhandledRejection", (error) => {
  log("error", "unhandled_rejection", {
    message: error?.message || String(error),
  });
});

function listenWithPortFallback(preferredPort = config.port, host = config.host, maxOffset = 20) {
  return new Promise((resolve, reject) => {
    let offset = 0;
    const tryListen = () => {
      const port = preferredPort + offset;
      const onError = (error) => {
        server.off("listening", onListening);
        if (error?.code === "EADDRINUSE" && offset < maxOffset) {
          offset += 1;
          log("warn", "port_busy", { port, nextPort: preferredPort + offset });
          setTimeout(tryListen, 80);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    };
    tryListen();
  });
}

if (require.main === module) {
  listenWithPortFallback(config.port, config.host).then((port) => {
    log("info", "server_started", {
      version: config.version,
      url: `${config.tlsCertPath ? "https" : "http"}://${config.host}:${port}`,
      dataDir: config.dataDir,
      sqliteFile: config.sqliteFile,
      warning:
        config.tlsCertPath || config.host === "127.0.0.1"
          ? undefined
          : "Сервер слушает внешние интерфейсы без TLS. Используйте reverse proxy или NIGHTVAULT_TLS_CERT/NIGHTVAULT_TLS_KEY.",
    });
  }).catch((error) => {
    log("error", "server_start_failed", { message: error.message, code: error.code });
    process.exitCode = 1;
  });
}

module.exports = { app, server, listenWithPortFallback, broadcastAdminEvent, getRuntimeMetrics };
