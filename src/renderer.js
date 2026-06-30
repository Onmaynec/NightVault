window.NV_RENDERER_STARTED = true;
let runtimeDefaultServer = "http://127.0.0.1:3000";
const DEFAULT_SERVER = "http://127.0.0.1:3000";
const RELEASE_LABEL = "1.3.9";
function normServerUrl(v) {
  return window.NVClientApi?.normalizeServer
    ? window.NVClientApi.normalizeServer(v, DEFAULT_SERVER)
    : (String(v || DEFAULT_SERVER).trim().replace(/\/+$/, ""));
}
function getServerHttp() {
  return normServerUrl(localStorage.nvServerUrl || runtimeDefaultServer || DEFAULT_SERVER);
}
function getServerApi() {
  return getServerHttp() + "/api";
}
function getServerWs() {
  return getServerHttp().replace(/^http/i, "ws");
}
function setServerUrl(v) {
  localStorage.nvServerUrl = normServerUrl(v);
  return localStorage.nvServerUrl;
}

const app = document.querySelector("#app");
let nvBootHasRendered = false;
function renderBootLoading(message = "Запуск NightVault…") {
  window.NV_RENDERER_STARTED = true;
  if (!app || nvBootHasRendered) return;
  app.innerHTML = `<div class="auth"><div class="authBox panelIn"><div class="logo">Night<span>Vault</span></div><div class="small">${message}</div><div class="bootLoader"></div></div></div>`;
}
function showBootError(error) {
  const message = error?.message || error?.reason?.message || String(error || "unknown");
  if (app && !nvBootHasRendered) {
    app.innerHTML = `<div class="auth"><div class="authBox panelIn"><div class="logo">Night<span>Vault</span></div><h2>Клиент не смог загрузиться</h2><div class="small">${String(message).replace(/[&<>"']/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" })[m])}</div><button class="btn" id="bootReload" type="button">Перезагрузить</button></div></div>`;
    document.querySelector("#bootReload")?.addEventListener("click", () => location.reload());
  }
  console.error("NightVault boot error", error);
}
function withTimeout(promise, timeoutMs, fallback) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}
window.addEventListener("error", (event) => showBootError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => showBootError(event.reason));
renderBootLoading();
const nvBridge = window.nv || {
  close: () => window.close(),
  minimize: () => {},
  toggleFull: () => {},
  windowPrefsGet: async () => ({ closeToTray: true, minimizeToTray: false, startMaximized: false }),
  windowPrefsSet: async (data) => data || {},
  notify: async () => {},
  openExternal: async () => ({ ok: false }),
  authSave: async () => ({ ok: false, persistent: false }),
  authCurrent: async () => null,
  authList: async () => [],
  authUse: async () => null,
  authRemove: async () => [],
  authClearCurrent: async () => ({ ok: true }),
  getVersion: async () => RELEASE_LABEL,
  getServerInfo: async () => ({ url: runtimeDefaultServer, status: { mode: "fallback" } }),
  checkUpdates: async () => ({ dev: true }),
  downloadUpdate: async () => ({ ok: false }),
  installUpdate: async () => ({ ok: false }),
  onUpdateAvailable: () => {},
  onUpdateProgress: () => {},
  onUpdateDownloaded: () => {},
  onUpdateError: () => {},
  onUpdateStatus: () => {},
  onChangelog: () => {},
  onWindowState: () => {},
};
window.NVBridge = nvBridge;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const defaultState = () => ({
  token: "",
  refreshToken: "",
  accountKey: "",
  user: null,
  settings: {},
  chats: [],
  messages: {},
  nextCursors: {},
  fileUrls: {},
  active: null,
  tab: "chats",
  q: "",
  searchInChat: false,
  chatSearch: "",
  replyTo: null,
  typing: {},
  folder: "all",
  fullscreen: false,
  recording: null,
  mediaFilter: "all",
  dateFilter: "",
  locked: false,
  fake: false,
  appVersion: localStorage.nvAppVersion || RELEASE_LABEL,
  theme: localStorage.nvTheme || "crimson",
  accent: localStorage.nvAccent || "#e11b2f",
  blur: localStorage.nvBlur === "1",
  selected: new Set(),
  editId: null,
  micId: localStorage.nvMicId || "",
  accounts: [],
  chatBg: (localStorage.nvChatBg === "frost" ? "none" : (localStorage.nvChatBg || "crimson")),
  fontSize: Number(localStorage.nvFontSize || 15),
  fontFamily: localStorage.nvFontFamily || "system",
  notes: localStorage.nvNotes || "",
  transportSecurity: getServerHttp().startsWith("https://"),
  settingsSection: localStorage.nvSettingsSection || "overview",
  uiDensity: localStorage.nvDensity || "comfortable",
  motion: localStorage.nvMotion || "balanced",
  bubbleStyle: localStorage.nvBubbleStyle || "modern",
  sidebarWidth: localStorage.nvSidebarWidth || "normal",
  rightPanel: true,
  showAvatars: localStorage.nvShowAvatars !== "0",
  windowPrefs: { closeToTray: true, minimizeToTray: false, startMaximized: false },
  offlineQueue: [],
  chatPinnedBottom: true,
  assetUploading: { avatar: false, banner: false },
  contacts: { accepted: [], incoming: [], outgoing: [] },
  contactsFilter: localStorage.nvContactsFilter || "all",
  contactsQuery: "",
  virtualWindow: Number(localStorage.nvVirtualWindow || window.NVRendererCore?.virtualMessageDefault || 220),
  e2ee: { enabled: true, deviceId: localStorage.nvE2eeDeviceId || "", publicKey: null, privateKey: null },
  e2eeDevices: {},
  e2eeFiles: {},
});
let S = defaultState();
Object.defineProperty(window, "S", { get: () => S, set: (value) => { S = value; } });
window.__nvHandleInlineError = (error) => toast("Ошибка действия интерфейса: " + (error?.message || error));
let sock = null;
let lastActivity = Date.now();
let voiceTimer = null;
const nvAssetState = { inFlight: new Map(), failed: new Set(), renderTimer: null };

function scheduleRender(reason = "") {
  if (!S?.user || nvAssetState.renderTimer) return;
  nvAssetState.renderTimer = setTimeout(() => {
    nvAssetState.renderTimer = null;
    try {
      render();
    } catch (error) {
      console.error("NightVault scheduled render failed", reason, error);
      try { toast("Ошибка обновления интерфейса: " + (error?.message || error)); } catch {}
    }
  }, 40);
}

function safeClassList(value, fallback = "avatar") {
  const classes = String(value || fallback)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => /^[a-zA-Z0-9_-]{1,48}$/.test(item));
  return classes.length ? classes.join(" ") : fallback;
}

function avatarInitial(name) {
  return (String(name || "?").trim().charAt(0) || "?").toUpperCase();
}

function h(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
}
function inlineArg(value) {
  return encodeURIComponent(String(value || "")).replace(/'/g, "%27");
}
function time(t) {
  return t
    ? new Date(t).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}
function date(t) {
  return t ? new Date(t).toLocaleDateString("ru-RU") : "";
}
function fmt(n = 0) {
  return n >= 1048576
    ? (n / 1048576).toFixed(1) + " MB"
    : n >= 1024
      ? (n / 1024).toFixed(1) + " KB"
      : n + " B";
}
function fileUrl(u) {
  const value = String(u || "");
  if (!value) return "";
  if (value.startsWith("/api/files/")) return S.fileUrls[value] || "";
  try {
    const url = new URL(value, getServerHttp());
    const server = new URL(getServerHttp());
    if (url.origin !== server.origin) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function attachmentRef(value) {
  const ref = String(value || "");
  return /^\/api\/files\/[a-f0-9]{36}$/i.test(ref) ? ref : "";
}

async function hydrateFile(ref, options = {}) {
  ref = attachmentRef(ref);
  if (!ref) return "";
  const force = Boolean(options && options.force);
  if (S.fileUrls[ref] && !force) return S.fileUrls[ref];
  if (force && S.fileUrls[ref]) {
    try { if (String(S.fileUrls[ref]).startsWith("blob:")) URL.revokeObjectURL(S.fileUrls[ref]); } catch {}
    delete S.fileUrls[ref];
  }
  if (!S.token || nvAssetState.failed.has(ref)) return "";
  if (nvAssetState.inFlight.has(ref)) return nvAssetState.inFlight.get(ref);
  const task = (async () => {
    try {
      const response = await authorizedFetch(ref, { method: "GET", timeout: 30000 }, false);
      if (!response.ok) throw new Error("asset http " + response.status);
      const blob = await response.blob();
      const finalBlob = await decryptBlobForRef(ref, blob);
      const url = URL.createObjectURL(finalBlob);
      S.fileUrls[ref] = url;
      nvAssetState.failed.delete(ref);
      return url;
    } catch (error) {
      nvAssetState.failed.add(ref);
      console.warn("NightVault asset hydrate failed", ref, error?.message || error);
      return "";
    } finally {
      nvAssetState.inFlight.delete(ref);
    }
  })();
  nvAssetState.inFlight.set(ref, task);
  return task;
}

async function hydrateAssets(values = []) {
  const refs = new Set();
  const add = (value) => {
    const ref = attachmentRef(value);
    if (ref) refs.add(ref);
  };
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string") add(value);
    else {
      add(value.avatar);
      add(value.banner);
      add(value.url);
      add(value.attachment?.url);
      add(value.other?.avatar);
      add(value.other?.banner);
    }
  }
  await Promise.allSettled([...refs].map(hydrateFile));
}

function clearBlobUrls() {
  for (const url of Object.values(S.fileUrls || {})) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  revokeObjectUrl(S.user?._avatarPreviewUrl);
  revokeObjectUrl(S.user?._bannerPreviewUrl);
  S.fileUrls = {};
  nvAssetState.failed.clear();
  nvAssetState.inFlight.clear();
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function e2eeKeyPrefix(username = S.user?.username || localStorage.nvLastUser || "guest") {
  return "nvE2ee_" + btoa(`${getServerHttp()}|${String(username).toLowerCase()}`).replace(/=+$/g, "");
}
function randomHex(bytes = 16) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function ensureE2eeIdentity(username) {
  username = String(username || S.user?.username || localStorage.nvLastUser || "guest").toLowerCase();
  const prefix = e2eeKeyPrefix(username);
  let deviceId = localStorage[`${prefix}_deviceId`] || localStorage.nvE2eeDeviceId || "";
  let privateJwk = null;
  let publicJwk = null;
  try { privateJwk = JSON.parse(localStorage[`${prefix}_private`] || "null"); } catch {}
  try { publicJwk = JSON.parse(localStorage[`${prefix}_public`] || "null"); } catch {}
  if ((!deviceId || !privateJwk || !publicJwk) && nvBridge.e2eeKeyLoad) {
    try {
      const saved = await nvBridge.e2eeKeyLoad({ server: getServerHttp(), username });
      if (saved?.deviceId && saved?.privateJwk && saved?.publicJwk) {
        deviceId = saved.deviceId;
        privateJwk = saved.privateJwk;
        publicJwk = saved.publicJwk;
        localStorage[`${prefix}_private`] = JSON.stringify(privateJwk);
        localStorage[`${prefix}_public`] = JSON.stringify(publicJwk);
        localStorage[`${prefix}_deviceId`] = deviceId;
        localStorage.nvE2eeDeviceId = deviceId;
      }
    } catch (error) {
      console.warn("NightVault shared E2EE key load failed", error?.message || error);
    }
  }
  if (!deviceId || !privateJwk || !publicJwk) {
    deviceId = randomHex(16);
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    localStorage[`${prefix}_private`] = JSON.stringify(privateJwk);
    localStorage[`${prefix}_public`] = JSON.stringify(publicJwk);
    localStorage[`${prefix}_deviceId`] = deviceId;
    localStorage.nvE2eeDeviceId = deviceId;
  }
  try {
    await nvBridge.e2eeKeySave?.({ server: getServerHttp(), username, deviceId, privateJwk, publicJwk });
  } catch (error) {
    console.warn("NightVault shared E2EE key save failed", error?.message || error);
  }
  S.e2ee = S.e2ee || {};
  S.e2ee.deviceId = deviceId;
  S.e2ee.publicKey = publicJwk;
  S.e2ee.privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { deviceId, publicKey: publicJwk };
}
async function e2eeWrapKey(rawKey, senderPrivateKey, senderDeviceId, recipient) {
  const publicKey = await crypto.subtle.importKey("jwk", recipient.publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, senderPrivateKey, 256));
  const info = new TextEncoder().encode(`NightVault keywrap v1:${senderDeviceId}:${recipient.id}`);
  const material = new Uint8Array(bits.length + info.length);
  material.set(bits); material.set(info, bits.length);
  const digest = await crypto.subtle.digest("SHA-256", material);
  const wrappingKey = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, rawKey));
  return { username: recipient.username, deviceId: recipient.id, iv: bytesToBase64(iv), keyCiphertext: bytesToBase64(ciphertext) };
}
async function e2eeUnwrapKey(envelope) {
  if (!S.e2ee?.privateKey || !envelope?.senderPublicKey) return null;
  const target = (envelope.recipients || []).find((item) => item.deviceId === S.e2ee.deviceId && item.username === S.user?.username);
  if (!target) return null;
  const senderPublic = await crypto.subtle.importKey("jwk", envelope.senderPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: senderPublic }, S.e2ee.privateKey, 256));
  const info = new TextEncoder().encode(`NightVault keywrap v1:${envelope.senderDeviceId}:${target.deviceId}`);
  const material = new Uint8Array(bits.length + info.length);
  material.set(bits); material.set(info, bits.length);
  const digest = await crypto.subtle.digest("SHA-256", material);
  const wrappingKey = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  const rawKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(target.iv) }, wrappingKey, base64ToBytes(target.keyCiphertext));
  return await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
}
async function loadChatE2eeDevices(chatId) {
  if (S.e2eeDevices[chatId]) return S.e2eeDevices[chatId];
  const response = await api(`/chats/${encodeURIComponent(chatId)}/e2ee-devices`);
  S.e2eeDevices[chatId] = response.devices || [];
  return S.e2eeDevices[chatId];
}
async function encryptPayloadForChat(chatId, payload) {
  if (!S.e2ee?.privateKey) await ensureE2eeIdentity(S.user?.username || localStorage.nvLastUser || "guest");
  const devices = await loadChatE2eeDevices(chatId);
  const valid = devices.filter((device) => device.publicKey?.kty === "EC" && device.publicKey?.crv === "P-256");
  if (!valid.length) return null;
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const contentKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, contentKey, new TextEncoder().encode(JSON.stringify(payload))));
  const recipients = [];
  for (const device of valid) {
    try { recipients.push(await e2eeWrapKey(rawKey, S.e2ee.privateKey, S.e2ee.deviceId, device)); } catch {}
  }
  if (!recipients.length) return null;
  return { v: 1, alg: "P-256+AES-256-GCM", iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext), senderDeviceId: S.e2ee.deviceId, senderPublicKey: S.e2ee.publicKey, recipients };
}
async function decryptMessage(message) {
  if (!message?.e2ee || message.decrypted) return message;
  try {
    if (!S.e2ee?.privateKey) await ensureE2eeIdentity(S.user?.username || localStorage.nvLastUser || "guest");
    const key = await e2eeUnwrapKey(message.e2ee);
    if (!key) throw new Error("no recipient key");
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(message.e2ee.iv) }, key, base64ToBytes(message.e2ee.ciphertext));
    const payload = JSON.parse(new TextDecoder().decode(raw));
    message.decrypted = true;
    message.decryptedText = String(payload.text || "");
    if (payload.attachment) {
      message.decryptedAttachment = payload.attachment;
      const ref = attachmentRef(payload.attachment.url || message.attachment?.url);
      if (ref && payload.attachment.e2eeFile) S.e2eeFiles[ref] = payload.attachment.e2eeFile;
    }
  } catch {
    message.decrypted = false;
    message.decryptError = true;
  }
  return message;
}
async function decryptMessagesInPlace(messages = []) {
  await Promise.all((messages || []).map((message) => decryptMessage(message)));
  return messages;
}
async function encryptFileForUpload(file) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await file.arrayBuffer());
  const safeName = `encrypted-${Date.now().toString(36)}.nve`;
  const encryptedFile = new File([ciphertext], safeName, { type: "application/octet-stream" });
  encryptedFile.__nvPlain = { name: file.name || "file", type: file.type || "application/octet-stream", size: file.size, e2eeFile: { key: bytesToBase64(rawKey), iv: bytesToBase64(iv), name: file.name || "file", type: file.type || "application/octet-stream", size: file.size } };
  return encryptedFile;
}
async function decryptBlobForRef(ref, blob) {
  const meta = S.e2eeFiles?.[ref];
  if (!meta?.key || !meta?.iv) return blob;
  const key = await crypto.subtle.importKey("raw", base64ToBytes(meta.key), { name: "AES-GCM" }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(meta.iv) }, key, await blob.arrayBuffer());
  return new Blob([raw], { type: meta.type || "application/octet-stream" });
}
async function deriveLocalSecret(secret, salt, iterations = 210000) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}
function hasLocalLock() {
  try {
    const record = JSON.parse(localStorage.nvLockRecord || "null");
    return Boolean(record?.salt && record?.hash && record?.iterations);
  } catch {
    return false;
  }
}
async function setLocalLock(secret) {
  secret = String(secret || "");
  if (secret.length < 6 || secret.length > 128)
    throw new Error("Локальный PIN/пароль должен содержать 6–128 символов.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 210000;
  const hash = await deriveLocalSecret(secret, salt, iterations);
  localStorage.nvLockRecord = JSON.stringify({
    version: 1,
    algorithm: "PBKDF2-SHA256",
    iterations,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
  });
}
async function verifyLocalLock(secret) {
  try {
    const record = JSON.parse(localStorage.nvLockRecord || "null");
    if (!record?.salt || !record?.hash) return false;
    const actual = await deriveLocalSecret(
      String(secret || ""),
      base64ToBytes(record.salt),
      Number(record.iterations || 210000),
    );
    const expected = base64ToBytes(record.hash);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1)
      difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

function isImageAtt(a) {
  return String(a?.type || "").startsWith("image/");
}
function isVideoAtt(a) {
  return String(a?.type || "").startsWith("video/");
}
function isAudioAtt(a) {
  return String(a?.type || "").startsWith("audio/");
}
function currentChat() {
  return S.chats.find((x) => x.id === S.active);
}
function trustedPreviewUrl(value) {
  const url = String(value || "");
  return url.startsWith("blob:") || url.startsWith("data:image/") ? url : "";
}
function assetDisplayUrl(owner, field = "avatar") {
  if (!owner) return "";
  const previewKey = field === "banner" ? "_bannerPreviewUrl" : "_avatarPreviewUrl";
  const preview = trustedPreviewUrl(owner[previewKey]);
  if (preview) return preview;
  return fileUrl(owner[field]);
}
function cssImageUrl(url) {
  const safe = String(url || "").replace(/[\"\n\r\f]/g, "");
  return safe ? `background-image:url("${h(safe)}")` : "";
}
function av(u, cls = "avatar") {
  const name = u?.displayName || u?.username || "?";
  const safeCls = safeClassList(cls);
  const initial = avatarInitial(name);
  const ref = attachmentRef(u?.avatar);
  const url = assetDisplayUrl(u, "avatar");
  if (ref && !fileUrl(u?.avatar) && !nvAssetState.failed.has(ref)) {
    hydrateFile(ref).then((result) => { if (result && S.user) scheduleRender("avatar"); }).catch(() => {});
  }
  if (url) {
    return `<img class="${safeCls}" src="${h(url)}" alt="${h(name)}" loading="lazy" decoding="async" data-fallback="${h(initial)}">`;
  }
  return `<div class="${safeCls}" aria-label="${h(name)}">${h(initial)}</div>`;
}
function apiEndpoint(path = "") {
  const value = String(path || "").trim();
  if (!value) return getServerApi();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const server = new URL(getServerHttp());
      if (url.origin !== server.origin) throw new Error("cross-origin api endpoint blocked");
      return url.toString();
    } catch {
      return getServerApi();
    }
  }
  if (value.startsWith("/api/")) return getServerHttp() + value;
  return getServerApi() + (value.startsWith("/") ? value : "/" + value);
}

async function rawApi(path, opt = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(opt.timeout || 18000),
  );
  const bodyIsForm =
    typeof FormData !== "undefined" && opt.body instanceof FormData;
  const headers = {
    ...(S.token ? { Authorization: "Bearer " + S.token } : {}),
    ...(bodyIsForm
      ? {}
      : opt.body
        ? { "Content-Type": "application/json" }
        : {}),
    ...(opt.headers || {}),
  };
  try {
    return await fetch(apiEndpoint(path), {
      ...opt,
      signal: controller.signal,
      headers,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshSession() {
  if (!S.refreshToken) return false;
  try {
    const response = await fetch(getServerApi() + "/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: S.refreshToken }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    await persistSession(data);
    return true;
  } catch {
    return false;
  }
}

async function authorizedFetch(path, opt = {}, retry = true) {
  try {
    const response = await rawApi(path, opt);
    if (response.status === 401 && retry && S.refreshToken) {
      let payload = null;
      try {
        payload = await response.clone().json();
      } catch {}
      if (
        payload?.details?.code === "token_expired" &&
        (await refreshSession())
      ) {
        return authorizedFetch(path, opt, false);
      }
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("сервер не отвечает");
    if (String(error.message || "").includes("Failed to fetch"))
      throw new Error("нет подключения к серверу " + getServerHttp());
    throw error;
  }
}

async function api(path, opt = {}) {
  const response = await authorizedFetch(path, opt, true);
  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ error: "Ошибка сервера" }));
    const error = new Error(payload.error || "Ошибка сервера");
    error.status = response.status;
    error.code = payload.details?.code || "";
    throw error;
  }
  if (response.status === 204) return {};
  return response.json();
}

async function persistSession(data) {
  S.token = data.accessToken || data.token || S.token;
  S.refreshToken = data.refreshToken || S.refreshToken || "";
  if (data.user) S.user = data.user;
  if (data.settings) S.settings = data.settings;
  const result = await nvBridge.authSave({
    server: getServerHttp(),
    username: S.user?.username,
    accessToken: S.token,
    refreshToken: S.refreshToken,
  });
  S.accounts = (await nvBridge.authList()) || [];
  if (result?.persistent === false) {
    toast(
      "Сессия действует только до закрытия: защищённое хранилище ОС недоступно.",
    );
  }
}

function toast(t) {
  let d = document.createElement("div");
  d.className = "toast";
  d.textContent = t;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3600);
}
function beep(freq = 520, dur = 0.12, vol = 0.045) {
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    const a = new A(),
      o = a.createOscillator(),
      g = a.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(a.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    setTimeout(() => a.close(), dur * 1000 + 80);
  } catch {}
}
function playLoginSound() {
  beep(140, 0.09, 0.035);
  setTimeout(() => beep(360, 0.1, 0.04), 90);
  setTimeout(() => beep(720, 0.13, 0.04), 200);
}
function notifyNew(title, body) {
  const preview = localStorage.nvToastPreview !== "0"
    ? ": " + String(body || "").slice(0, 80)
    : "";
  toast("🔔 " + title + preview);
  if (localStorage.nvMessageSound !== "0") beep(680, 0.08, 0.028);
  try {
    nvBridge.notify({ title, body });
  } catch {}
}

const themeAccents = {
  crimson: "#e11b2f",
  obsidian: "#8aa4ff",
  blood: "#ff1835",
  matrix: "#ff0033",
  black: "#e8e8e8",
  purple: "#9b5cff",
  telegram: "#6b7b8c",
  gold: "#d4af37",
  ocean: "#16b7d9",
  aurora: "#8b5cf6",
  ivory: "#8fc7e8",
};
function normalizeHexColor(value, fallback = "#8b5cf6") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return fallback;
}
function shadeHexColor(hex, amount = -28) {
  hex = normalizeHexColor(hex);
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function applyAccentVars(color = S.accent) {
  const accent = normalizeHexColor(color, themeAccents[S.theme] || "#8b5cf6");
  const accent2 = shadeHexColor(accent, -42);
  const targets = [document.documentElement, document.body].filter(Boolean);
  for (const node of targets) {
    node.style.setProperty("--red", accent);
    node.style.setProperty("--accent", accent);
    node.style.setProperty("--red2", accent2);
    node.style.setProperty("--mine", accent);
  }
}

function applyVisualPrefs() {
  if (S.chatBg === "frost") S.chatBg = "none";
  const classes = [
    "theme-" + (S.theme || "crimson"),
    S.blur ? "blur-on" : "",
    "chatbg-" + (S.chatBg || "none"),
    "density-" + (S.uiDensity || "comfortable"),
    "motion-" + (S.motion || "balanced"),
    "bubble-" + (S.bubbleStyle || "modern"),
    "side-" + (S.sidebarWidth || "normal"),
    S.rightPanel ? "" : "noRightPanel",
    S.showAvatars ? "" : "noAvatars",
  ].filter(Boolean);
  document.body.className = classes.join(" ");
  applyCustomThemeVars();
  applyAccentVars(S.accent || themeAccents[S.theme] || "#8b5cf6");
  document.documentElement.style.setProperty(
    "--chatFontSize",
    (S.fontSize || 15) + "px",
  );
  document.documentElement.style.setProperty(
    "--chatFontFamily",
    fontCss(S.fontFamily),
  );
}
function readCustomThemes() {
  try { return JSON.parse(localStorage.nvCustomThemes || "[]").slice(0, 24); } catch { return []; }
}
function applyCustomThemeVars() {
  const custom = readCustomThemes().find((item) => item.id === S.theme);
  if (localStorage.nvCustomWallpaper && S.chatBg === "custom") {
    document.documentElement.style.setProperty("--customWallpaper", `url(${localStorage.nvCustomWallpaper})`);
  }
  if (!custom) return;
  const map = { panel: "--panel", panel2: "--panel2", line: "--line", text: "--text", muted: "--muted", mine: "--mine", msg: "--msg", bg: "--chatBg" };
  for (const [key, css] of Object.entries(map)) if (custom[key]) document.documentElement.style.setProperty(css, custom[key]);
  if (custom.accent) document.documentElement.style.setProperty("--red", custom.accent);
}
function fontCss(v) {
  return v === "mono"
    ? "Consolas, monospace"
    : v === "serif"
      ? "Georgia, serif"
      : v === "telegram"
        ? "Segoe UI, Arial, sans-serif"
        : "Segoe UI, Arial, sans-serif";
}
function ensureAccentForTheme(theme) {
  if (!localStorage.nvAccentCustom) {
    S.accent = themeAccents[theme] || S.accent;
    localStorage.nvAccent = S.accent;
  }
}

function titlebar() {
  return S.fullscreen
    ? ""
    : `<div class="titlebar nvTitlebar"><div class="titleLeft"><span class="titleDot"></span><b>Night<span>Vault</span></b><em>${h(S.appVersion || RELEASE_LABEL)}</em></div><div class="winBtns"><button id="winMin" title="Свернуть">—</button><button id="winFull" title="Во весь экран">▢</button><button id="winClose" title="${S.windowPrefs?.closeToTray ? "Свернуть в трей" : "Закрыть"}">×</button></div></div>`;
}

let lastRenderAt = 0;
function rememberUiScroll() {
  return {
    list: document.querySelector(".chatList")?.scrollTop || 0,
    msgs: document.querySelector("#msgs")?.scrollTop || 0,
    active: S.active,
  };
}
function restoreUiScroll(pos, { messages = false } = {}) {
  requestAnimationFrame(() => {
    let list = document.querySelector(".chatList");
    if (list) list.scrollTop = pos.list || 0;
    let msgs = document.querySelector("#msgs");
    if (msgs && messages && pos.active === S.active)
      msgs.scrollTop = pos.msgs || 0;
  });
}
function stableRender({ keepMessages = false } = {}) {
  const pos = rememberUiScroll();
  render();
  restoreUiScroll(pos, { messages: keepMessages });
}

async function loadServerInfo() {
  try {
    const info = await withTimeout(nvBridge.getServerInfo?.(), 1500, null);
    const url = normServerUrl(info?.url || runtimeDefaultServer, runtimeDefaultServer);
    if (url) {
      runtimeDefaultServer = url;
      const saved = String(localStorage.nvServerUrl || "");
      if (!saved || /^https?:\/\/(localhost|127\.0\.0\.1)(:3000)?\/?$/i.test(saved)) {
        localStorage.nvServerUrl = url;
      }
    }
    if (info?.status?.message) console.info("NightVault server:", info.status.message);
  } catch {}
}

async function loadAppVersion() {
  try {
    const v = await nvBridge.getVersion();
    if (v && v !== "dev") {
      S.appVersion = v;
      localStorage.nvAppVersion = v;
    } else {
      S.appVersion = localStorage.nvAppVersion || S.appVersion || RELEASE_LABEL;
    }
  } catch {
    S.appVersion = S.appVersion || localStorage.nvAppVersion || RELEASE_LABEL;
  }
}
async function loadWindowPrefs() {
  try {
    S.windowPrefs = { ...S.windowPrefs, ...((await nvBridge.windowPrefsGet?.()) || {}) };
  } catch {}
}

function startupUpdateCheck(delay = 2500) {
  setTimeout(async () => {
    try {
      const r = await nvBridge.checkUpdates();
      if (r?.error) toast("Проверка обновлений: " + r.error);
    } catch (e) {
      toast("Проверка обновлений: " + (e.message || e));
    }
  }, delay);
}
async function init() {
  renderBootLoading("Проверка сервера и настроек клиента…");
  await withTimeout(loadServerInfo(), 1500);
  await withTimeout(loadAppVersion(), 1500);
  await withTimeout(loadWindowPrefs(), 1500);
  applyVisualPrefs();
  try {
    S.accounts = (await withTimeout(nvBridge.authList(), 1500, [])) || [];
    const current = await withTimeout(nvBridge.authCurrent(), 1500, null);
    if (current?.accessToken) {
      setServerUrl(current.server || getServerHttp());
      S.token = current.accessToken;
      S.refreshToken = current.refreshToken || "";
      S.accountKey = current.key || "";
    } else if (localStorage.nvToken) {
      S.token = localStorage.nvToken;
      localStorage.removeItem("nvToken");
    }
  } catch {}
  try {
    await withTimeout(loadAudioDevices(), 1200);
  } catch {}
  if (S.token) {
    try {
      const response = await api("/me");
      S.user = response.user;
      S.settings = response.settings || {};
      loadOfflineQueue();
      localStorage.nvLastUser = S.user.username;
      await ensureE2eeIdentity(S.user.username);
      await persistSession({ user: S.user, settings: S.settings });
      await hydrateAssets([S.user]);
      connect();
      await loadChats(false);
      await loadContacts(false).catch(() => {});
      render();
      setTimeout(() => scrollChatBottom(false), 0);
      startupUpdateCheck(1800);
      return;
    } catch (error) {
      if (error.status === 401) {
        await nvBridge.authClearCurrent().catch(() => {});
        S.token = "";
        S.refreshToken = "";
      } else {
        toast("Не удалось восстановить сессию: " + error.message);
      }
    }
  }
  renderAuth();
  startupUpdateCheck(1800);
}
function renderAuth() {
  window.NV_APP_READY = true;
  nvBootHasRendered = true;
  app.innerHTML = `<div class="auth"><div class="authBox panelIn"><div class="logo">Night<span>Vault</span></div><div class="small">защищённый клиент · SQLite · E2EE · Sync 1.3.9</div>
    <details class="connectDetails" open><summary>Подключение к серверу</summary>
      <input id="serverUrl" class="field" placeholder="https://chat.example.com" value="${h(getServerHttp())}">
      <div class="small">Для подключения через интернет используй HTTPS. HTTP подходит только для localhost или доверенной VPN.</div>
      <button class="btn ghost" id="saveServer" type="button" style="width:100%;margin-top:8px">Сохранить адрес</button>
    </details>
    ${accountSwitcher()}<input id="u" class="field" placeholder="ник" value="${h(localStorage.nvLastUser || "")}"><input id="p" class="field" type="password" placeholder="пароль (минимум 10 символов)"><input id="two" class="field" placeholder="TOTP или recovery-код"><button class="btn" id="login">Войти</button><button class="btn ghost" id="swap">Регистрация</button><button class="btn ghost" id="authCheckUpdates" type="button">Проверить обновления</button><div class="appVersionLine">Установлена версия: <b>${h(S.appVersion || "...")}</b></div><div class="small" style="margin-top:12px">Токены аккаунтов сохраняются через защищённое хранилище операционной системы.</div></div></div>`;
  let registering = false;
  $("#saveServer").onclick = () => {
    setServerUrl($("#serverUrl").value);
    S.transportSecurity = getServerHttp().startsWith("https://");
    toast("Адрес сервера сохранён: " + getServerHttp());
  };
  $("#swap").onclick = () => {
    registering = !registering;
    $("#login").textContent = registering ? "Создать аккаунт" : "Войти";
    $("#swap").textContent = registering
      ? "У меня уже есть аккаунт"
      : "Регистрация";
    $("#two").style.display = registering ? "none" : "block";
  };
  $("#authCheckUpdates").onclick = () => checkUpdates();
  $("#login").onclick = async () => {
    try {
      setServerUrl($("#serverUrl")?.value || getServerHttp());
      S.transportSecurity = getServerHttp().startsWith("https://");
      const identity = await ensureE2eeIdentity($("#u").value);
      const body = {
        username: $("#u").value,
        password: $("#p").value,
        displayName: $("#u").value,
        twofa: $("#two").value,
        e2eeDeviceId: identity.deviceId,
        e2eePublicKey: identity.publicKey,
        deviceName: navigator.userAgent,
      };
      const response = await api(registering ? "/register" : "/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await persistSession(response);
      localStorage.nvLastUser = S.user.username;
      await ensureE2eeIdentity(S.user.username);
      playLoginSound();
      await hydrateAssets([S.user]);
      connect();
      await loadChats(false);
      await loadContacts(false).catch(() => {});
      render();
      if (response.recoveryCodeUsed)
        toast("Использован recovery-код. Создай новые коды в настройках 2FA.");
    } catch (error) {
      toast("Ошибка входа/регистрации: " + error.message);
    }
  };
}
let reconnectTimer = null;
async function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (!S.token || !S.user) return;
  if (sock) {
    try {
      sock.onclose = null;
      sock.close();
    } catch {}
  }
  try {
    const { ticket } = await api("/ws-ticket", { method: "POST", body: "{}" });
    sock = new WebSocket(
      getServerWs() + "?ticket=" + encodeURIComponent(ticket),
    );
  } catch (error) {
    if (!reconnectTimer) reconnectTimer = setTimeout(() => connect(), 3500);
    return;
  }
  sock.onopen = () => { toast("Сервер подключен"); flushOfflineQueue(); };
  sock.onerror = () => toast("WebSocket: нет соединения с сервером");
  sock.onclose = () => {
    if (S.token && S.user && !reconnectTimer)
      reconnectTimer = setTimeout(() => connect(), 3500);
  };
  sock.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "message") {
        S.messages[payload.message.chatId] =
          S.messages[payload.message.chatId] || [];
        await decryptMessage(payload.message);
        if (
          !S.messages[payload.message.chatId].some(
            (message) => message.id === payload.message.id,
          )
        )
          S.messages[payload.message.chatId].push(payload.message);
        await hydrateAssets([payload.message, payload.chat]);
        await loadChats(false);
        if (
          S.active !== payload.message.chatId &&
          payload.message.from !== S.user.username
        ) {
          const chat = S.chats.find(
            (value) => value.id === payload.message.chatId,
          );
          if (S.settings.notify !== false && !chat?.muted?.[S.user.username])
            notifyNew(
              chat?.title || chat?.other?.displayName || "NightVault",
              payload.message.text ||
                payload.message.attachment?.name ||
                "Новое сообщение",
            );
        }
        if (S.active === payload.message.chatId) renderMessagesOnly(false);
        else render();
      }
      if (payload.type === "message_update") {
        await decryptMessage(payload.message);
        replaceMsg(payload.message);
        await hydrateAssets([payload.message.decryptedAttachment || payload.message.attachment || payload.message]);
        renderMessagesOnly(false);
      }
      if (payload.type === "message_delete") {
        for (const key in S.messages)
          S.messages[key] = S.messages[key].filter(
            (message) => message.id !== payload.id,
          );
        S.selected.delete(payload.id);
        renderMessagesOnly(false);
      }
      if (payload.type === "chat_update") {
        await loadChats(false);
        render();
      }
      if (payload.type === "chat_removed") {
        S.chats = S.chats.filter((chat) => chat.id !== payload.chatId);
        if (S.active === payload.chatId) S.active = null;
        render();
      }
      if (payload.type === "contacts_update") {
        S.contacts = payload.contacts || S.contacts;
        await hydrateAssets([
          ...(S.contacts.accepted || []).map((item) => item.user),
          ...(S.contacts.incoming || []).map((item) => item.user),
          ...(S.contacts.outgoing || []).map((item) => item.user),
        ]);
        if (S.tab === "contacts") render();
      }
      if (payload.type === "typing") {
        S.typing[payload.chatId] = payload.active ? payload.user : null;
        renderTyping();
        setTimeout(() => {
          if (S.typing[payload.chatId] === payload.user) {
            delete S.typing[payload.chatId];
            renderTyping();
          }
        }, 2600);
      }
      if (payload.type === "delivered") {
        const message = findMsg(payload.messageId);
        if (message && !(message.deliveredTo || []).includes(payload.user)) {
          message.deliveredTo = [...(message.deliveredTo || []), payload.user];
          renderMessagesOnly(true);
        }
      }
      if (payload.type === "read") {
        const messages = S.messages[payload.chatId] || [];
        let reached = !payload.through;
        for (const message of messages) {
          if (!(message.readBy || []).includes(payload.user))
            message.readBy = [...(message.readBy || []), payload.user];
          if (message.id === payload.through) reached = true;
          if (reached && payload.through) break;
        }
        await loadChats(false);
        renderMessagesOnly(false);
      }
    } catch (error) {
      toast("Ошибка WS: " + error.message);
    }
  };
}
function replaceMsg(message) {
  for (const k in S.messages) {
    let i = S.messages[k].findIndex((m) => m.id === message.id);
    if (i >= 0) S.messages[k][i] = message;
  }
}
async function loadChats(draw = true) {
  const response = await api("/chats");
  S.chats = response.chats || [];
  await Promise.all(S.chats.map((chat) => chat.last ? decryptMessage(chat.last) : null));
  await hydrateAssets([S.user, ...S.chats]);
  if (draw) render();
}
async function loadContacts(draw = true) {
  const response = await api("/contacts");
  S.contacts = response.contacts || { accepted: [], incoming: [], outgoing: [] };
  await hydrateAssets([
    ...(S.contacts.accepted || []).map((item) => item.user),
    ...(S.contacts.incoming || []).map((item) => item.user),
    ...(S.contacts.outgoing || []).map((item) => item.user),
  ]);
  if (draw && S.tab === "contacts") render();
  return S.contacts;
}
async function openChat(id) {
  try {
    S.active = id;
    S.selected.clear();
    S.editId = null;
    const chat = S.chats.find((value) => value.id === id);
    if (chat?.other) {
      try {
        const response = await api("/user/" + chat.other.username);
        chat.other = response.user;
      } catch {}
    }
    const response = await api(
      "/chats/" + encodeURIComponent(id) + "/messages?limit=100",
    );
    S.messages[id] = response.messages || [];
    S.nextCursors[id] = response.nextCursor || null;
    await decryptMessagesInPlace(S.messages[id]);
    await hydrateAssets([chat, ...(S.messages[id] || []).map((m) => m.decryptedAttachment || m)]);
    const through = S.messages[id].at(-1)?.id || null;
    api("/chats/" + encodeURIComponent(id) + "/read", {
      method: "POST",
      body: JSON.stringify({ through }),
    }).catch(() => {});
    S.mediaFilter = "all";
    S.dateFilter = "";
    S.chatSearch = "";
    render();
    setTimeout(() => scrollChatBottom(false), 0);
  } catch (error) {
    toast("Не удалось открыть чат: " + error.message);
  }
}

async function loadOlderMessages() {
  if (!S.active || !S.nextCursors[S.active]) return;
  const container = $("#msgs");
  const oldHeight = container?.scrollHeight || 0;
  try {
    const response = await api(
      "/chats/" +
        encodeURIComponent(S.active) +
        "/messages?limit=100&before=" +
        encodeURIComponent(S.nextCursors[S.active]),
    );
    const existing = new Set(
      (S.messages[S.active] || []).map((message) => message.id),
    );
    const older = (response.messages || []).filter(
      (message) => !existing.has(message.id),
    );
    await decryptMessagesInPlace(older);
    S.messages[S.active] = [...older, ...(S.messages[S.active] || [])];
    S.nextCursors[S.active] = response.nextCursor || null;
    await hydrateAssets(older);
    renderMessagesOnly(true);
    requestAnimationFrame(() => {
      if (container) container.scrollTop += container.scrollHeight - oldHeight;
    });
  } catch (error) {
    toast("История не загружена: " + error.message);
  }
}
function filteredChats() {
  let q = S.q.toLowerCase();
  return S.chats
    .filter((c) => {
      if (isHidden(c.id) && S.folder !== "hidden") return false;
      if (isArchived(c.id) && S.folder !== "archive") return false;
      let name = (c.type === "private" ? c.other?.displayName : c.title) || "";
      let ok =
        !q ||
        name.toLowerCase().includes(q) ||
        (c.last?.text || "").toLowerCase().includes(q) ||
        (c.last?.attachment?.name || "").toLowerCase().includes(q);
      if (S.folder === "unread") ok = ok && c.unread > 0;
      if (S.folder === "groups")
        ok = ok && (c.type === "group" || c.type === "channel");
      if (S.folder === "saved") ok = ok && c.type === "saved";
      if (S.folder === "archive") ok = ok && isArchived(c.id);
      if (S.folder === "hidden") ok = ok && isHidden(c.id);
      return ok;
    })
    .sort(
      (a, b) =>
        isPinnedChat(b.id) - isPinnedChat(a.id) ||
        (b.last?.createdAt || b.createdAt) - (a.last?.createdAt || a.createdAt),
    );
}
function switchTab(tab) {
  S.tab = tab;
  if (tab !== "chats") S.selected.clear();
  render();
}
function safeRenderBlock(name, fallback, fn) {
  try {
    return fn();
  } catch (error) {
    console.error("NightVault render block failed:", name, error);
    return `<div class="sidePad renderError"><h2>Раздел временно не отрисовался</h2><p>${h(error?.message || error)}</p><button class="btn" onclick="render()">Повторить</button></div>` || fallback;
  }
}
function render() {
  window.NV_APP_READY = true;
  nvBootHasRendered = true;
  if (!S.user) return renderAuth();
  applyVisualPrefs();
  const unreadTotal = S.chats.reduce((a, c) => a + (c.unread || 0), 0);
  const tabs = `<div class="tabs"><button class="tab ${S.tab === "chats" ? "active" : ""}" onclick="switchTab('chats')">💬<small>Чаты</small>${unreadTotal ? "<span class=count>" + unreadTotal + "</span>" : ""}</button><button class="tab ${S.tab === "contacts" ? "active" : ""}" onclick="switchTab('contacts')">👥<small>Люди</small></button><button class="tab ${S.tab === "profile" ? "active" : ""}" onclick="switchTab('profile')">👤<small>Профиль</small></button><button class="tab ${S.tab === "notes" ? "active" : ""}" onclick="switchTab('notes')">📝<small>Заметки</small></button><button class="tab ${S.tab === "links" ? "active" : ""}" onclick="switchTab('links')">🔗<small>Ссылки</small></button><button class="tab ${S.tab === "downloads" ? "active" : ""}" onclick="switchTab('downloads')">📁<small>Файлы</small></button><button class="tab ${S.tab === "settings" ? "active" : ""}" onclick="switchTab('settings')">⚙️<small>Опции</small></button>${S.fullscreen ? `<button class="tab bottom" id="minAppBtn">—<small>Свернуть</small></button><button class="tab" id="closeAppBtn">⏻<small>Закрыть</small></button>` : `<span class="tabSpacer"></span>`}<button class="tab" onclick="logout()">⇥<small>Аккаунт</small></button></div>`;
  const left = safeRenderBlock("left", "", () => renderLeft());
  const center = safeRenderBlock("center", "", () => renderCenter());
  const side = safeRenderBlock("side", "", () => renderSide());
  app.innerHTML = titlebar() + `<div class="shell ${S.fullscreen ? "fullscreen" : "windowed"} section-${h(S.tab || "chats")}">${tabs}${left}<main class="main">${center}</main><aside class="side">${side}</aside></div>`;
  bind();
  if (S.tab === "chats") requestAnimationFrame(() => scrollChatBottom(false));
}
function renderChatListOnly() {
  let el = document.querySelector(".chatList");
  if (el)
    el.innerHTML =
      filteredChats()
        .map((c) => chatRow(c))
        .join("") || "<div class=empty>Пусто</div>";
}
function renderLeft() {
  if (["profile", "settings", "notes", "links", "downloads"].includes(S.tab))
    return `<section class=list><div class=sidePad><h2>${pageTitle()}</h2><p class=muted>Раздел приложения</p><button class=btn onclick="accountManager()">Аккаунты</button></div></section>`;
  return `<section class="list"><div class="search"><input id="q" placeholder="Поиск" value="${h(S.q)}"><button class="iconBtn" onclick="newGroup()">✚</button></div><div class="folders"><button class="chip ${S.folder === "all" ? "active" : ""}" onclick="S.folder='all';render()">Все</button><button class="chip ${S.folder === "unread" ? "active" : ""}" onclick="S.folder='unread';render()">Непроч.</button><button class="chip ${S.folder === "groups" ? "active" : ""}" onclick="S.folder='groups';render()">Группы</button><button class="chip ${S.folder === "saved" ? "active" : ""}" onclick="S.folder='saved';render()">Избранное</button><button class="chip ${S.folder === "archive" ? "active" : ""}" onclick="S.folder='archive';render()">Архив</button><button class="chip ${S.folder === "hidden" ? "active" : ""}" onclick="openHiddenFolder()">Скрытые</button></div><div class="chatList">${
    filteredChats()
      .map((c) => chatRow(c))
      .join("") || "<div class=empty>Пусто</div>"
  }</div></section>`;
}
function chatRow(c) {
  let isSaved = c.type === "saved";
  let u =
    c.type === "private"
      ? (c.other || { displayName: "Пользователь", username: "unknown", avatar: "" })
      : {
          displayName: c.title || "Избранное",
          username: isSaved ? "saved" : c.type,
          avatar: c.avatar,
          isSaved,
        };
  let last = c.last
    ? (c.last.decryptedAttachment || c.last.attachment)
      ? "📎 " + ((c.last.decryptedAttachment || c.last.attachment).name || "файл")
      : (c.last.decryptedText || c.last.text)
    : getDraft(c.id)
      ? "Черновик: " + getDraft(c.id)
      : "Нет сообщений";
  return `<div class="row ${S.active === c.id ? "active" : ""}" onclick="openChat('${c.id}')">${isPinnedChat(c.id) ? "<span class=pinBadge>📌</span>" : ""}${av(u)}<div class=rowMain><div class=rowTop><b class=ellipsis>${h(u.displayName)}</b><span class=muted>${time(c.last?.createdAt)}</span></div><div class="small ellipsis">${h(last || "")}</div></div>${c.unread ? `<span class=count>${c.unread}</span>` : ""}</div>`;
}
function renderCenter() {
  if (S.locked) return lockPage();
  if (S.fake) return fakePage();
  if (S.tab === "profile") return profilePage();
  if (S.tab === "settings") return settingsPage();
  if (S.tab === "contacts") return contactsPage();
  if (S.tab === "notes") return notesPage();
  if (S.tab === "links") return linksPage();
  if (S.tab === "downloads") return downloadsPage();
  const c = currentChat();
  if (!c) return "<div class=empty>Выбери чат или найди человека по нику</div>";
  const u =
    c.type === "private"
      ? (c.other || { displayName: "Пользователь", username: "unknown", avatar: "" })
      : { displayName: c.title || "Чат", username: c.type, avatar: c.avatar };
  const list = visibleMessages(c.id);
  const older = S.nextCursors[c.id]
    ? '<button class="btn ghost loadOlder" onclick="loadOlderMessages()">Загрузить более ранние сообщения</button>'
    : "";
  const emptyState = !list.length && !older ? '<div class="chatEmptyState">Сообщений пока нет. Напишите первым.</div>' : '';
  return `<div class=chatHead onclick="showProfile('${c.id}')">${av(u)}<div class=chatTitle><b>${h(u.displayName)}</b><div class=small>${c.type === "private" ? statusLine(u) : c.type}</div></div><div class=headActions onclick="event.stopPropagation()"><button class=iconBtn onclick="S.searchInChat=!S.searchInChat;render()" title="Поиск">🔎</button><button class=iconBtn onclick="togglePinnedChat('${c.id}')" title="Закрепить">📌</button><button class=iconBtn onclick="toggleArchiveChat('${c.id}')" title="Архив">🗄</button><button class=iconBtn onclick="showChatMenu(event)" title="Меню">⋮</button></div></div>${S.searchInChat ? `<div class=search><input id=chatSearch placeholder="Поиск в этом чате" value="${h(S.chatSearch || "")}"><input id=dateSearch type=date value="${h(S.dateFilter || "")}"><select id=mediaFilter><option value=all>Все</option><option value=photo>Фото</option><option value=video>Видео</option><option value=document>Документы</option><option value=audio>Аудио</option><option value=link>Ссылки</option></select><button class=iconBtn onclick="S.searchInChat=false;S.chatSearch='';S.dateFilter='';S.mediaFilter='all';render()">×</button></div>` : ""}${S.selected.size ? selectionBar() : ""}${c.pinned?.length ? `<div class=pinned>📌 Закреплено: ${c.pinned.length}</div>` : ""}<div class=messages id=msgs onscroll="toggleBottomBtn()"><div class="messagesInner">${older}${emptyState}${list.map((m) => msgHtml(m)).join("")}</div><button id=bottomBtn class=bottomBtn onclick="scrollChatBottom(false)">↓</button></div><div class=typing id=typing></div><div class="composer" ondragover="event.preventDefault()" ondrop="dropFiles(event)">${S.replyTo ? `<div class=reply>Ответ на сообщение <button onclick="S.replyTo=null;render()">×</button></div>` : ""}${S.editId ? `<div class=reply>Редактирование <button onclick="cancelEdit()">×</button></div>` : ""}<button class=iconBtn onclick="attachFiles()" title="Файл">📎</button><textarea id=txt placeholder="Напишите сообщение..."></textarea><button class=iconBtn onclick="toggleEmojiPicker()" title="Эмодзи">😊</button><button class="iconBtn voiceBtn" id=recBtn title="Зажми для записи" onmousedown="startVoice()" onmouseup="stopVoice(true)" ontouchstart="event.preventDefault();startVoice()" ontouchend="event.preventDefault();stopVoice(true)">🎤</button><div id=voiceState class=voiceState></div><button class=btn onclick="sendMsg()" title="Отправить">➤</button></div>`;
}
function selectionBar() {
  return `<div class=selectedBar><button class=iconBtn onclick="clearSelection()">×</button><b>${S.selected.size} выбрано</b><span class=spacer></span><button class=iconBtn onclick="deleteSelected(0)">🗑 у себя</button><button class=iconBtn onclick="deleteSelected(1)">🗑 у всех</button></div>`;
}
const reactionList = ["👍", "👎", "❤️", "🔥", "😂", "🤣", "😮", "😢", "😭", "🎉", "✅", "🤔", "😍", "😡", "👏", "🙏", "💯", "⚡", "🌙", "💀"];

function msgHtml(m) {
  const mine = m.from === S.user.username;
  const query = (S.chatSearch || "").trim().slice(0, 64);
  const visibleText = m.e2ee ? (m.decryptedText || (m.decryptError ? "🔒 Не удалось расшифровать на этом устройстве" : "")) : (m.text || "");
  const text = messageTextHtml(visibleText, query);
  const reply = m.replyTo ? findMsg(m.replyTo) : null;
  const replyPreview = reply || m.replyPreview || null;
  const allowed = new Set(reactionList);
  const reactions = Object.entries(m.reactions || {})
    .filter(([emoji, users]) => allowed.has(emoji) && users?.length)
    .map(
      ([emoji, users]) =>
        `<button class=reaction onclick="react('${m.id}','${inlineArg(emoji)}')">${h(emoji)} ${users.length}</button>`,
    )
    .join("");
  const displayAttachment = m.decryptedAttachment || m.attachment;
  const voiceOnly = Boolean(displayAttachment?.voice && !visibleText && !replyPreview);
  const author = authorFor(m);
  return `<div class="msgWrap ${mine ? "mineWrap" : ""}"><label class=selectBox><input type=checkbox ${S.selected.has(m.id) ? "checked" : ""} onchange="toggleSelect('${m.id}')"></label>${!mine ? av(author, "msgAvatar") : ""}<div class="msg ${mine ? "mine" : ""} ${voiceOnly ? "voiceMsg" : ""} ${displayAttachment && String(displayAttachment.type || "").startsWith("image/") ? "photoMsg" : ""}" oncontextmenu="ctx(event,'${m.id}')" ondblclick="toggleSelect('${m.id}')">${replyPreview ? `<div class="reply replyPreview">↩ <b>${h(replyPreview.from || "")}</b>: ${h(replyPreview.text || replyPreview.attachment?.name || "сообщение")}</div>` : ""}${text ? `<div class=msgText>${text}</div>` : ""}${displayAttachment ? attHtml(displayAttachment) : ""}${reactions}<div class=msgMeta>${m.editedAt ? "изменено · " : ""}${time(m.createdAt)} ${mine ? status(m) : ""}</div></div>${mine ? av(author, "msgAvatar mineMsgAvatar") : ""}</div>`;
}
function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageTextHtml(raw = "", query = "") {
  if (window.NVRendererMessages?.linkifyAndMentions) {
    return window.NVRendererMessages.linkifyAndMentions(raw, query);
  }
  let text = h(raw);
  query = String(query || "").slice(0, 64);
  if (query) {
    const re = new RegExp("(" + escapeReg(query) + ")", "ig");
    text = text.replace(re, '<mark class="highlight">$1</mark>');
  }
  return text;
}
function statusLine(user) {
  if (!user) return "";
  if (user.statusText) {
    if (user.status === "online" || user.status === "hidden" || user.status === "recently") return user.statusText;
  }
  if (user.status === "hidden") return "статус скрыт";
  if (user.status === "online") return "в сети";
  return user.lastSeen ? "был " + date(user.lastSeen) + " " + time(user.lastSeen) : "был недавно";
}
function findMsg(id) {
  for (const arr of Object.values(S.messages)) {
    let m = arr.find((x) => x.id === id);
    if (m) return m;
  }
  return null;
}
function status(m) {
  let c = S.chats.find((x) => x.id === m.chatId);
  let others = (c?.members || []).filter((x) => x !== S.user.username);
  if (!others.length) return "<span class=read>✓</span>";
  if (others.every((x) => (m.readBy || []).includes(x)))
    return "<span class=read>✓✓</span>";
  if (others.some((x) => (m.deliveredTo || []).includes(x)))
    return "<span class=sent>✓</span>";
  return "<span class=sending>•</span>";
}
function attHtml(a) {
  if (!a) return "";
  const url = fileUrl(a.url);
  const ref = attachmentRef(a.url);
  const type = String(a.type || "");
  const loading = `<button class="fileCard" onclick="downloadAttachment('${ref}','${inlineArg(a.name || "file")}')">📥 <span>${h(a.name || "Файл")}<br><span class=small>${fmt(a.size)}</span></span></button>`;
  if (type.startsWith("image/"))
    return url
      ? `<div class=photoBubble><img class=photoPreview src="${h(url)}" alt="${h(a.name || "image")}"><div class=photoOverlay><span>${h(a.name)}</span><span>${fmt(a.size)}</span></div></div>`
      : loading;
  if (type.startsWith("video/"))
    return url
      ? `<div class=photoBubble><video class=photoPreview controls src="${h(url)}"></video><div class=photoOverlay><span>${h(a.name)}</span><span>${fmt(a.size)}</span></div></div>`
      : loading;
  if (type.startsWith("audio/")) {
    if (a.voice)
      return `<div class=voiceBubble><button class=voicePlay onclick="playVoice(event,'${ref}')">▶</button><div class=voiceWave>${Array.from({ length: 34 }, (_, i) => '<i style="height:' + (((i * 7) % 22) + 6) + 'px"></i>').join("")}</div><span class=voiceDur>${Math.floor((a.duration || 0) / 60)}:${String((a.duration || 0) % 60).padStart(2, "0")}</span></div>`;
    return url
      ? `<audio controls src="${h(url)}"></audio><div class=small>${h(a.name)} · ${fmt(a.size)}</div>`
      : loading;
  }
  return `<button class=fileCard onclick="downloadAttachment('${ref}','${inlineArg(a.name || "file")}')">📄 <span>${h(a.name)}<br><span class=small>${fmt(a.size)}</span></span></button>`;
}

async function downloadAttachment(ref, encodedName) {
  const url = await hydrateFile(ref);
  if (!url) return toast("Файл недоступен или у аккаунта нет прав.");
  const anchor = document.createElement("a");
  anchor.href = url;
  const metaName = S.e2eeFiles?.[ref]?.name;
  anchor.download = metaName || decodeURIComponent(encodedName || "file");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function playVoice(event, ref) {
  event.stopPropagation();
  const button = event.currentTarget;
  if (button.audio && !button.audio.paused) {
    button.audio.pause();
    button.textContent = "▶";
    return;
  }
  const url = await hydrateFile(ref);
  if (!url) return toast("Голосовое недоступно.");
  const audio = new Audio(url);
  audio.preload = "auto";
  button.audio = audio;
  button.textContent = "⏸";
  audio.onerror = () => {
    button.textContent = "▶";
    toast("Не удалось открыть голосовое сообщение.");
  };
  audio.onended = () => (button.textContent = "▶");
  audio.play().catch((error) => {
    button.textContent = "▶";
    toast("Не удалось проиграть: " + (error.message || error));
  });
}

function securitySummary() {
  const transport = getServerHttp().startsWith("https://")
    ? "✅ TLS: соединение с сервером защищено"
    : getServerHttp().startsWith("http://localhost") ||
        getServerHttp().startsWith("http://127.0.0.1")
      ? "🟡 TLS: локальное HTTP-соединение"
      : "⚠️ TLS: соединение не зашифровано";
  const twoFactor = S.settings.twoFactorEnabled
    ? "✅ TOTP 2FA включена"
    : "🟡 TOTP 2FA выключена";
  const localLock = hasLocalLock()
    ? "✅ Локальная блокировка включена"
    : "🟡 Локальная блокировка выключена";
  return `<div class=securityCard>${transport}<br>✅ Сквозное шифрование E2EE включено<br>${twoFactor}<br>${localLock}</div>`;
}

function renderSide() {
  const c = currentChat();
  if (!c)
    return `<div class=sidePad><h2>NightVault</h2>${securitySummary()}<p class=muted>Версия 1.3.9</p></div>`;
  const u =
    c.type === "private"
      ? c.other
      : {
          displayName: c.title,
          username: c.type,
          avatar: c.avatar,
          bio: c.description,
          banner: c.banner,
        };
  const files = (S.messages[c.id] || [])
    .filter((message) => message.attachment)
    .slice(-8)
    .reverse();
  const bannerRef = attachmentRef(u.banner);
  const bannerUrl = assetDisplayUrl(u, "banner");
  if (bannerRef && !fileUrl(u.banner)) hydrateFile(bannerRef).then(() => { if (S.active === c.id) render(); }).catch(() => {});
  return `<div class=sidePad><div class=profileHero style="${cssImageUrl(bannerUrl)}">${av(u, "bigAvatar " + (u.avatarFrame || ""))}</div><h2>${h(u.displayName)} ${u.verification === "verified" ? "🟢" : u.verification === "suspicious" ? "🤖" : ""}</h2><div class=muted>@${h(u.username)}</div><p>${h(u.bio || "Нет описания")}</p>${securitySummary()}<div class=profileActions><button class=btn onclick="showProfile('${c.id}')">Открыть профиль</button>${c.type === "private" ? `<button class='btn ghost' onclick="repMenu('${u.username}','praise')">💜 Похвалить</button><button class='btn danger' onclick="repMenu('${u.username}','report')">🚩 Пожаловаться</button>` : ""}<button class="btn ghost" onclick="hideActiveChat()">🙈 Скрыть чат</button><button class="btn ghost" onclick="muteChat()">🔔 Уведомления</button></div><h3>Файлы</h3>${files.map((message) => `<button class=fileCard onclick="downloadAttachment('${attachmentRef(message.attachment.url)}','${inlineArg(message.attachment.name || "file")}')">📎 <span class=ellipsis>${h(message.attachment.name)}</span></button>`).join("") || "<div class=muted>Пока нет файлов</div>"}</div>`;
}
function profilePage() {
  const privacy = S.user.privacy || {};
  const visibilityOptions = (selected) => [
    ["all", "Все"],
    ["contacts", "Только контакты"],
    ["nobody", "Только я"],
  ].map(([value, label]) => `<option value=${value} ${selected === value ? "selected" : ""}>${label}</option>`).join("");
  const presenceOptions = [
    ["online", "Показывать онлайн"],
    ["recently", "Показывать “был недавно”"],
    ["hidden", "Не показывать статус"],
  ].map(([value, label]) => `<option value=${value} ${privacy.presenceMode === value ? "selected" : ""}>${label}</option>`).join("");
  const myBannerRef = attachmentRef(S.user.banner);
  const myBannerUrl = assetDisplayUrl(S.user, "banner");
  if (myBannerRef && !fileUrl(S.user.banner)) hydrateFile(myBannerRef).then(() => { if (S.tab === "profile") render(); }).catch(() => {});
  const uploadNotice = S.assetUploading?.avatar || S.assetUploading?.banner ? '<div class="uploadNotice">Изображение загружается, интерфейс остаётся доступным…</div>' : '';
  return `<div class=sidePad style="max-width:820px"><h1>Мой профиль</h1>${uploadNotice}<div class=profileHero style="${cssImageUrl(myBannerUrl)}">${av(S.user, "bigAvatar " + (S.user.avatarFrame || ""))}</div><div class=formGrid><label>Отображаемое имя<input id=pd class=field value="${h(S.user.displayName)}"></label><label>Цвет профиля<input id=profileColor class=field type=color value="${h(S.user.profileColor || S.accent || "#e11b2f")}"></label></div><textarea id=pb class=field placeholder="О себе">${h(S.user.bio || "")}</textarea><div class=formGrid><label>Рамка аватарки<select id=avatarFrame class=field><option value="">Без рамки</option><option value="frame-red">Crimson Ring</option><option value="frame-gold">Golden Ring</option><option value="frame-purple">Purple Neon</option><option value="frame-ocean">Ocean Glow</option><option value="frame-halo">Halo Ring</option><option value="frame-orbit">Orbit Ring</option><option value="frame-shadow">Shadow Ring</option><option value="frame-neon">Neon Ring</option></select></label><label>Кто видит аватар/баннер<select id=privacyAvatar class=field>${visibilityOptions(privacy.avatar || "all")}</select></label><label>Кто видит последний визит<select id=privacyLastSeen class=field>${visibilityOptions(privacy.lastSeen || "all")}</select></label><label>Кто видит онлайн-статус<select id=privacyStatus class=field>${visibilityOptions(privacy.status || "all")}</select></label><label>Режим присутствия<select id=presenceMode class=field>${presenceOptions}</select></label></div><div class=buttonRow><button class=btn onclick="saveProfile()">Сохранить профиль</button><button class="btn ghost" onclick="changeAvatar()">Сменить аватар</button><button class="btn ghost" onclick="changeBanner()">Загрузить баннер</button><button class="btn danger" onclick="logout()">Выйти из аккаунта</button></div><div class=securityCard>Приватность 1.0.9: поля профиля можно показывать всем, только контактам или никому. Режим присутствия управляет “в сети / был недавно / скрыт”.</div><div id=statsBox></div></div>`;
}

function settingSectionButton(id, icon, title, text) {
  const active = (S.settingsSection || "overview") === id ? " active" : "";
  return `<button class="settingsTab${active}" onclick="setSettingsSection('${id}')"><span>${icon}</span><b>${h(title)}</b><small>${h(text)}</small></button>`;
}
function setSettingsSection(id) {
  S.settingsSection = id;
  localStorage.nvSettingsSection = id;
  render();
}
function settingsPanel() {
  const section = S.settingsSection || "overview";
  const autoLock = Number(localStorage.nvAutoLock || 0);
  const micOptions =
    (S.audioDevices || [])
      .map(
        (device) =>
          `<option value="${h(device.deviceId)}">${h(device.label || "Микрофон")}</option>`,
      )
      .join("") || '<option value="">Системный микрофон</option>';
  if (section === "overview")
    return `<section class=settingsPanel><div class=settingsHero><div><h2>NightVault ${h(S.appVersion || RELEASE_LABEL)}</h2><p>Быстрый центр состояния: подключение, безопасность, обновления и версия приложения.</p></div><button class="btn updateBig" onclick="checkUpdates()">Проверить обновления</button></div><div class=settingCards><div class=settingCard>${securitySummary()}</div><div class=settingCard><b>Подключение</b><span>${h(getServerHttp())}</span><small>${getServerHttp().startsWith("https://") ? "Интернет-подключение через HTTPS" : "HTTP подходит только для localhost, тестов или доверенной VPN"}</small></div><div class=settingCard><b>Окно</b><span>${S.windowPrefs?.closeToTray ? "X сворачивает в трей" : "X закрывает приложение"}</span><small>${S.windowPrefs?.minimizeToTray ? "Кнопка свернуть уводит в трей" : "Кнопка свернуть работает как обычное окно"}</small></div></div><label>Адрес сервера<input id=serverSettings class=field value="${h(getServerHttp())}" placeholder="https://chat.example.com"></label><button class="btn ghost" onclick="saveServerConnection()">Сохранить подключение</button></section>`;
  if (section === "appearance") {
    const customThemes = readCustomThemes();
    const themeOptions = [
      ["aurora", "Aurora Purple"], ["ivory", "Ivory Frost"], ["crimson", "Crimson"], ["obsidian", "Obsidian"], ["purple", "Purple Signal"], ["telegram", "Telegram Gray"], ["gold", "Gold Vault"], ["ocean", "Ocean Deep"],
      ...customThemes.map((item) => [item.id, item.name || "Своя тема"]),
    ].map(([value, label]) => `<option value="${h(value)}">${h(label)}</option>`).join("");
    const swatches = ["#8b5cf6", "#22d3ee", "#3b82f6", "#ec4899", "#ef4444", "#f59e0b", "#22c55e", "#111827", "#e8cf86", "#60a5fa"];
    return `<section class="settingsPanel themeStudio"><div class="themeHero"><div class="themeIcon"></div><div><h2>Персонализация</h2><p class=muted>Темы, акцентные цвета, фон чата и собственные пресеты в стиле Telegram.</p><div class="themeTags"><span>👁 Комфорт для глаз</span><span>✨ Aurora/Ivory</span><span>🎨 Свои темы</span><span>🖼 Свой фон</span></div></div></div><div class="themeStudioGrid"><div class="themeCard"><h3>Выбор темы</h3><select id=theme class=field>${themeOptions}</select><div class="themeChoiceGrid"><button class="themeChoice aurora" onclick="quickTheme('aurora')"><b>Aurora Purple</b><small>тёмная тема со свечением</small></button><button class="themeChoice ivory" onclick="quickTheme('ivory')"><b>Ivory Frost</b><small>светлая мягкая тема</small></button></div></div><div class="themeCard"><h3>Акцентный цвет</h3><input id=accent class=field type=color value="${h(S.accent || "#8b5cf6")}"><div class=swatches>${swatches.map((color) => `<button style="--sw:${color}" onclick="setAccent('${color}')"></button>`).join("")}</div></div><div class="themeCard"><h3>Предпросмотр сообщений</h3><div class=previewChat><div class="msgWrap"><div class="msg"><div class=msgText>Обычное сообщение</div><div class=msgMeta>12:30</div></div></div><div class="msgWrap mineWrap"><div class="msg mine"><div class=msgText>Сообщение пользователя</div><div class=msgMeta>12:31 ✓✓</div></div></div></div></div></div><div class=formGrid><label>Плотность интерфейса<select id=uiDensity class=field><option value=compact>Компактно</option><option value=comfortable>Комфортно</option><option value=spacious>Просторно</option></select></label><label>Стиль сообщений<select id=bubbleStyle class=field><option value=modern>Современный</option><option value=soft>Мягкие пузырьки</option><option value=glass>Glass</option><option value=classic>Классический</option></select></label><label>Ширина списков<select id=sidebarWidth class=field><option value=compact>Уже</option><option value=normal>Обычно</option><option value=wide>Шире</option></select></label></div><div class="themeCard"><h3>Свой фон и своя тема</h3><div class=buttonRow><button class="btn ghost" onclick="chooseCustomWallpaper()">Загрузить фон чата</button><button class="btn ghost" onclick="saveCustomThemePreset()">Сохранить текущий вид как тему</button><button class="btn ghost" onclick="exportThemePreset()">Экспорт темы</button><button class="btn ghost" onclick="importThemePreset()">Импорт темы</button></div><label class=toggleRow><input id=blur type=checkbox ${S.blur ? "checked" : ""}> <span>Размытие панелей / glass blur</span></label><label class=toggleRow><input id=showAvatars type=checkbox ${S.showAvatars ? "checked" : ""}> <span>Показывать аватарки возле сообщений</span></label></div><button class=btn onclick="saveSettings()">Сохранить оформление</button></section>`;
  }
  if (section === "chat")
    return `<section class=settingsPanel><h2>Чаты и сообщения</h2><p class=muted>Настройки чтения, анимаций и поведения поля ввода.</p><div class=formGrid><label>Фон/эффект чата<select id=chatBg class=field><option value=none>Без анимации</option><option value=rain>Дождь</option><option value=snow>Снег</option><option value=matrix>Матрица</option><option value=particles>Красные частицы</option><option value=space>Космос</option><option value=waves>Волны</option><option value=aurora>Aurora</option><option value=custom>Свой фон</option></select></label><label>Уровень анимаций<select id=motion class=field><option value=off>Выключены</option><option value=calm>Спокойные</option><option value=balanced>Сбалансированные</option><option value=rich>Выразительные</option></select></label><label>Размер шрифта<input id=fontSize class=field type=range min=12 max=22 value="${S.fontSize || 15}"></label><label>Шрифт<select id=fontFamily class=field><option value=system>System</option><option value=telegram>Telegram-like</option><option value=mono>Mono</option><option value=serif>Serif</option></select></label><label>Виртуальное окно сообщений<input id=virtualWindow class=field type=number min=80 max=700 value="${S.virtualWindow || 220}"></label></div><div class=previewChat><div class="msgWrap"><div class="msg"><div class=msgText>Так будет выглядеть обычное сообщение.</div><div class=msgMeta>12:40</div></div></div><div class="msgWrap mineWrap"><div class="msg mine"><div class=msgText>А так — ваше сообщение.</div><div class=msgMeta>12:41 ✓✓</div></div></div></div><button class=btn onclick="saveSettings()">Сохранить настройки чата</button></section>`;
  if (section === "notifications")
    return `<section class=settingsPanel><h2>Уведомления и звук</h2><p class=muted>Что показывать, когда приходит новое сообщение.</p><label class=toggleRow><input id=notify type=checkbox ${S.settings.notify !== false ? "checked" : ""}> <span>Показывать системные уведомления</span></label><label class=toggleRow><input id=messageSound type=checkbox ${localStorage.nvMessageSound !== "0" ? "checked" : ""}> <span>Звук нового сообщения</span></label><label class=toggleRow><input id=toastPreview type=checkbox ${localStorage.nvToastPreview !== "0" ? "checked" : ""}> <span>Показывать текст сообщения в toast</span></label><label>Микрофон<select id=mic class=field>${micOptions}</select></label><button class="btn ghost" onclick="testMicList()">Обновить список микрофонов</button><button class=btn onclick="saveSettings()">Сохранить уведомления</button></section>`;
  if (section === "window")
    return `<section class=settingsPanel><h2>Окно и трей</h2><p class=muted>Здесь исправлено старое поведение fullscreen: приложение стартует как нормальное окно, запоминает размер и может уходить в трей.</p><label class=toggleRow><input id=closeToTray type=checkbox ${S.windowPrefs?.closeToTray ? "checked" : ""}> <span>Кнопка × сворачивает в трей, а не закрывает резко</span></label><label class=toggleRow><input id=minimizeToTray type=checkbox ${S.windowPrefs?.minimizeToTray ? "checked" : ""}> <span>Кнопка — сворачивает в трей</span></label><label class=toggleRow><input id=startMaximized type=checkbox ${S.windowPrefs?.startMaximized ? "checked" : ""}> <span>Открывать приложение развёрнутым на весь экран окна</span></label><div class=small>Полноэкранный режим теперь включается только вручную кнопкой ▢ или клавишей F11.</div><button class=btn onclick="saveSettings()">Сохранить поведение окна</button></section>`;
  if (section === "privacy")
    return `<section class=settingsPanel><h2>Безопасность</h2>${securitySummary()}<div class=formGrid><label>Новый локальный PIN / пароль<input id=localLockSecret class=field type=password placeholder="не менее 6 символов; пусто — не менять"></label><label>Автоблокировка, минут<input id=lock class=field type=number min=0 max=1440 value="${autoLock}"></label></div><label class=toggleRow><input id=clearLocalLock type=checkbox> <span>Отключить локальную блокировку</span></label><div class=buttonRow><button class=btn onclick="saveSettings()">Сохранить безопасность</button><button class="btn ghost" onclick="lockApp()">Заблокировать сейчас</button><button class="btn ghost" onclick="exportBackup()">Экспорт backup с AES-GCM</button><button class="btn ghost" onclick="importBackup()">Импорт backup</button><button class="btn ghost" onclick="loadSecurityEvents()">Журнал безопасности</button><button class="btn ghost" onclick="devices()">Устройства</button></div><div class=buttonRow><button class="btn ghost" onclick="setupTwoFactor()">${S.settings.twoFactorEnabled ? "Перенастроить 2FA" : "Включить TOTP 2FA"}</button>${S.settings.twoFactorEnabled ? '<button class="btn danger" onclick="disableTwoFactor()">Отключить 2FA</button>' : ""}</div><h3>Смена пароля</h3><input id=oldPassword class=field type=password placeholder="Текущий пароль"><input id=newPassword class=field type=password placeholder="Новый пароль, минимум 10 символов"><button class="btn ghost" onclick="changePassword()">Сменить пароль</button><button class="btn danger" onclick="logoutAll()">Завершить другие сессии</button><div class=small>Горячая клавиша Panic: Ctrl + Shift + X. Скрытые чаты: Ctrl + H.</div></section>`;
  return `<section class=settingsPanel><h2>Раздел не найден</h2></section>`;
}
function settingsPage() {
  return `<div class="sidePad settingsPage"><div class=settingsHeader><div><h1>Настройки</h1><p>Разделены по смыслу, чтобы не было «кишмиша» в одной вкладке.</p></div><button class="btn ghost" onclick="saveSettings()">Сохранить всё</button></div><div class=settingsLayout><nav class=settingsMenu>${settingSectionButton("overview", "🌙", "Обзор", "версия, сервер, статус")}${settingSectionButton("appearance", "🎨", "Внешний вид", "тема, плотность, пузырьки")}${settingSectionButton("chat", "💬", "Чаты", "фон, шрифт, анимации")}${settingSectionButton("notifications", "🔔", "Уведомления", "звук, микрофон, toast")}${settingSectionButton("window", "🪟", "Окно", "трей, размеры, fullscreen")}${settingSectionButton("privacy", "🔐", "Безопасность", "PIN, 2FA, backup")}</nav>${settingsPanel()}</div></div>`;
}

function pageTitle() {
  return (
    {
      profile: "Профиль",
      settings: "Настройки",
      notes: "Заметки",
      links: "Ссылки",
      downloads: "Загрузки",
    }[S.tab] || "Раздел"
  );
}
function accountSwitcher() {
  const accounts = S.accounts || [];
  if (!accounts.length) return "";
  return `<div class="accountStrip">${accounts
    .map(
      (account) =>
        `<button class="chip" type="button" onclick="switchAccount('${account.key}')">👤 ${h(account.username)}<small>${h(account.server)}</small></button>`,
    )
    .join("")}</div>`;
}

async function switchAccount(key) {
  try {
    const account = await nvBridge.authUse(key);
    if (!account?.accessToken) return toast("Сессия аккаунта недоступна.");
    clearBlobUrls();
    setServerUrl(account.server);
    S = defaultState();
    S.token = account.accessToken;
    S.refreshToken = account.refreshToken || "";
    S.accountKey = account.key || key;
    S.accounts = (await nvBridge.authList()) || [];
    const response = await api("/me");
    S.user = response.user;
    S.settings = response.settings || {};
    await ensureE2eeIdentity(S.user.username);
    await hydrateAssets([S.user]);
    connect();
    await loadChats(false);
    render();
  } catch (error) {
    toast("Не удалось открыть аккаунт: " + error.message);
  }
}

function accountManager() {
  const accounts = S.accounts || [];
  modal(
    `<h2>Аккаунты</h2>${
      accounts
        .map(
          (account) =>
            `<div class=fileCard>👤 ${h(account.username)}<small>${h(account.server)}</small><span class=spacer></span><button class=btn onclick="switchAccount('${account.key}')">Открыть</button><button class='btn danger' onclick="removeAccount('${account.key}')">Удалить</button></div>`,
        )
        .join("") || "<div class=muted>Нет сохранённых аккаунтов</div>"
    }<button class=btn onclick="logout()">Добавить/войти в другой</button>`,
  );
}

async function removeAccount(key) {
  S.accounts = (await nvBridge.authRemove(key)) || [];
  toast("Аккаунт убран из защищённого хранилища");
  closeModal();
  accountManager();
}

function isHidden(id) {
  return JSON.parse(localStorage.nvHiddenChats || "[]").includes(id);
}
function hideActiveChat() {
  if (!S.active) return;
  saveSet("nvHiddenChats", S.active, true);
  toast("Чат скрыт. Открыть: Ctrl+H");
  S.active = null;
  render();
}
async function openHiddenFolder() {
  if (hasLocalLock()) {
    const secret = prompt("PIN для скрытых чатов");
    if (!(await verifyLocalLock(secret || ""))) return toast("Неверный PIN");
  }
  S.folder = "hidden";
  render();
}
function notesPage() {
  return `<div class=sidePad><h1>📝 Локальные заметки</h1><div class=small>Не синхронизируются с сервером.</div><textarea id=notesBox class=field style="min-height:55vh">${h(S.notes || "")}</textarea><button class=btn onclick="saveNotes()">Сохранить локально</button></div>`;
}
function saveNotes() {
  S.notes = $("#notesBox")?.value || "";
  localStorage.nvNotes = S.notes;
  toast("Заметки сохранены локально");
}
function allMessages() {
  return Object.values(S.messages).flat();
}
function normalizeExternalLink(value) {
  let link = String(value || "").trim();
  if (link.startsWith("www.")) link = "https://" + link;
  try {
    const url = new URL(link);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function openExternalLink(encoded) {
  const url = normalizeExternalLink(decodeURIComponent(encoded || ""));
  if (!url) return toast("Некорректная ссылка");
  await nvBridge.openExternal(url);
}

function linksPage() {
  const links = [];
  for (const message of allMessages()) {
    const found = (message.text || "").match(/https?:\/\/\S+|www\.\S+/gi) || [];
    found.forEach((value) => {
      const url = normalizeExternalLink(value);
      if (url) links.push({ url, from: message.from, time: message.createdAt });
    });
  }
  return `<div class=sidePad><h1>🔗 Все ссылки</h1>${
    links
      .map(
        (item) =>
          `<button class=fileCard onclick="openExternalLink('${inlineArg(item.url)}')">🔗 <span class=ellipsis>${h(item.url)}</span><small>${h(item.from)} · ${date(item.time)}</small></button>`,
      )
      .join("") || "<div class=empty>Ссылок пока нет</div>"
  }</div>`;
}
function downloadsPage() {
  let files = allMessages()
    .filter((m) => m.attachment)
    .map((m) => m.attachment);
  return `<div class=sidePad><h1>📁 Загрузки</h1><div class=folders><button class=chip onclick="filterDownloadType('all')">Все</button><button class=chip onclick="filterDownloadType('image')">Фото</button><button class=chip onclick="filterDownloadType('video')">Видео</button><button class=chip onclick="filterDownloadType('audio')">Музыка</button><button class=chip onclick="filterDownloadType('doc')">Документы</button></div><div id=downloadList>${renderDownloads(files)}</div></div>`;
}
function renderDownloads(files) {
  const filter = localStorage.nvDownloadFilter || "all";
  const list = files.filter(
    (attachment) =>
      filter === "all" ||
      (filter === "image" && String(attachment.type).startsWith("image/")) ||
      (filter === "video" && String(attachment.type).startsWith("video/")) ||
      (filter === "audio" && String(attachment.type).startsWith("audio/")) ||
      (filter === "doc" &&
        !String(attachment.type).startsWith("image/") &&
        !String(attachment.type).startsWith("video/") &&
        !String(attachment.type).startsWith("audio/")),
  );
  return (
    list
      .map(
        (attachment) =>
          `<button class=fileCard onclick="downloadAttachment('${attachmentRef(attachment.url)}','${inlineArg(attachment.name || "file")}')">📎 <span class=ellipsis>${h(attachment.name || "file")}</span><small>${fmt(attachment.size || 0)}</small></button>`,
      )
      .join("") || "<div class=empty>Файлов нет</div>"
  );
}
function filterDownloadType(t) {
  localStorage.nvDownloadFilter = t;
  render();
}
async function loadStatsBox() {
  let box = $("#statsBox");
  if (!box || !S.user) return;
  try {
    let r = await api("/stats/" + S.user.username);
    box.innerHTML = `<h2>Статистика</h2><div class=statsGrid><div>✉️ ${r.sent}<small>сообщений</small></div><div>🖼 ${r.photos}<small>фото</small></div><div>📅 ${r.days}<small>дней</small></div><div>📎 ${r.files}<small>файлов</small></div></div><h2>Достижения</h2>${(r.achievements || []).map((x) => `<div class=fileCard>${h(x)}</div>`).join("") || "<div class=muted>Пока нет достижений</div>"}`;
  } catch {}
}
async function uploadPlainProfileImage(file, label = "изображение") {
  if (!(file instanceof Blob)) throw new Error("Некорректный файл.");
  if (!String(file.type || "").startsWith("image/")) throw new Error("Выбери изображение.");
  if (file.size > 15 * 1024 * 1024) throw new Error(`${label} слишком большой, максимум 15 MB.`);
  const form = new FormData();
  form.append("file", file, file.name || `profile-${Date.now()}`);
  return api("/files", { method: "POST", body: form, timeout: 120000 });
}

async function validatePickedProfileImage(file, { label = "Изображение", maxBytes = 8 * 1024 * 1024, maxSide = 4096 } = {}) {
  if (!(file instanceof Blob)) throw new Error("Некорректный файл.");
  const type = String(file.type || "").toLowerCase();
  if (!type.startsWith("image/")) throw new Error(`${label}: выбери изображение.`);
  if (/svg|xml|html/.test(type) || /\.(svg|xml|html?)$/i.test(String(file.name || ""))) {
    throw new Error(`${label}: SVG/HTML/XML запрещены для безопасности.`);
  }
  if (file.size > maxBytes) throw new Error(`${label} слишком большой, максимум ${fmt(maxBytes)}.`);
  if (typeof createImageBitmap === "function") {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width > maxSide || bitmap.height > maxSide) {
        throw new Error(`${label}: размер картинки не больше ${maxSide}×${maxSide}px.`);
      }
    } finally {
      try { bitmap?.close?.(); } catch {}
    }
  }
  return true;
}

function revokeObjectUrl(url) {
  try { if (String(url || "").startsWith("blob:")) URL.revokeObjectURL(url); } catch {}
}
function setProfileAssetPreview(ref, file) {
  ref = attachmentRef(ref);
  if (!ref || !(file instanceof Blob)) return "";
  const previous = S.fileUrls[ref];
  revokeObjectUrl(previous);
  const url = URL.createObjectURL(file);
  S.fileUrls[ref] = url;
  nvAssetState.failed.delete(ref);
  return url;
}
function setTemporaryProfilePreview(field, file) {
  if (!S.user || !(file instanceof Blob)) return "";
  const key = field === "banner" ? "_bannerPreviewUrl" : "_avatarPreviewUrl";
  revokeObjectUrl(S.user[key]);
  const url = URL.createObjectURL(file);
  S.user = { ...S.user, [key]: url };
  return url;
}
function settleTemporaryProfilePreview(field, finalUrl = "") {
  if (!S.user) return;
  const key = field === "banner" ? "_bannerPreviewUrl" : "_avatarPreviewUrl";
  if (!finalUrl) {
    revokeObjectUrl(S.user[key]);
    const next = { ...S.user };
    delete next[key];
    S.user = next;
  }
}

function safeProfileRenderAfterAsset(label) {
  try {
    render();
    requestAnimationFrame(() => {
      if (S.tab === "profile") loadStatsBox().catch(() => {});
      if (S.tab === "chats") scrollChatBottom(false);
    });
  } catch (error) {
    console.error(`NightVault ${label} render failed`, error);
    toast(`${label}: интерфейс не был сброшен, но отрисовка дала ошибку: ${error.message || error}`);
  }
}

async function changeBanner() {
  let hadPreview = false;
  try {
    const files = await pickDomFiles({ accept: "image/png,image/jpeg,image/webp,image/gif", multiple: false });
    const file = files[0];
    if (!file) return;
    await validatePickedProfileImage(file, { label: "Баннер", maxBytes: 15 * 1024 * 1024, maxSide: 6000 });
    S.assetUploading.banner = true;
    setTemporaryProfilePreview("banner", file);
    hadPreview = true;
    safeProfileRenderAfterAsset("Баннер preview");
    toast("Загружаю баннер…");
    const uploaded = await uploadPlainProfileImage(file, "Баннер");
    if (!uploaded?.url) throw new Error("сервер не вернул ссылку на баннер");
    const ref = attachmentRef(uploaded.url);
    const previewUrl = ref ? setProfileAssetPreview(ref, file) : "";
    const response = await api("/me", {
      method: "PUT",
      body: JSON.stringify({ banner: uploaded.url }),
    });
    S.user = { ...(response.user || S.user), _bannerPreviewUrl: previewUrl || S.user._bannerPreviewUrl };
    S.settings = response.settings || S.settings;
    if (ref) hydrateFile(ref, { force: false }).catch(() => {});
    toast("Баннер обновлён");
  } catch (error) {
    if (hadPreview) settleTemporaryProfilePreview("banner", "");
    toast("Баннер не загружен: " + (error.message || error));
  } finally {
    if (S.assetUploading) S.assetUploading.banner = false;
    safeProfileRenderAfterAsset("Баннер");
  }
}
async function checkUpdates() {
  try {
    toast("Проверяю обновления...");
    const r = await nvBridge.checkUpdates();
    if (r?.dev)
      return modal(
        `<h2>Автообновление</h2><div class=fileCard>Текущая версия: ${h(r.current || S.appVersion || "dev")}</div><div class=muted>${h(r.message || "Автообновления работают только в установленной версии.")}</div><button class=btn onclick='closeModal()'>Понятно</button>`,
      );
    if (r?.error)
      return modal(
        `<h2>Проверка обновлений</h2><div class=fileCard>Версия: <b>${h(r.current || S.appVersion || "")}</b></div><div class=muted>${h(r.error)}</div><button class=btn onclick='closeModal()'>Понятно</button>`,
      );
    setTimeout(
      () => toast("Если обновление есть, окно появится автоматически."),
      600,
    );
  } catch (e) {
    modal(
      `<h2>Проверка обновлений</h2><div class=muted>${h(e.message || e)}</div><button class=btn onclick='closeModal()'>Понятно</button>`,
    );
  }
}
function showUpdateModal(data = {}) {
  closeModal();
  modal(
    `<div class=updateHero><div class=updateGlow>↻</div><h2>Доступно обновление NightVault ${h(data.version || "")}</h2><div class=fileCard>Установлена версия: <b>${h(data.current || S.appVersion || "")}</b><br>Новая версия: <b>${h(data.version || "")}</b></div><div class=muted>Чтобы продолжить безопасно пользоваться NightVault, установи свежую версию. Приложение скачает обновление, закроется и откроется уже обновлённым.</div><div id=updateProgress class=updateProgress><div></div></div><button class=btn onclick="downloadNightVaultUpdate()">Обновить сейчас</button></div>`,
    { lock: true },
  );
}
async function downloadNightVaultUpdate() {
  try {
    let p = $("#updateProgress");
    if (p) p.style.display = "block";
    let r = await nvBridge.downloadUpdate();
    if (r?.error) toast("Ошибка обновления: " + r.error);
    else toast("Загрузка обновления...");
  } catch (e) {
    toast("Ошибка обновления: " + e.message);
  }
}
async function installNightVaultUpdate() {
  try {
    await nvBridge.installUpdate();
  } catch (e) {
    toast("Установка обновления: " + e.message);
  }
}
function showUpdateReadyModal(data = {}) {
  closeModal();
  modal(
    `<div class=updateHero><div class=updateGlow>✓</div><h2>Обновление скачано</h2><div class=fileCard>Версия ${h(data.version || "новая")} готова к установке.</div><div class=muted>NightVault закроется и через несколько секунд откроется уже обновлённым.</div><button class=btn onclick="installNightVaultUpdate()">Перезапустить и установить</button></div>`,
    { lock: true },
  );
}
function showChangelogModal(data = {}) {
  const changes = (data.changes || []).map((x) => `<li>${h(x)}</li>`).join("");
  setTimeout(
    () =>
      modal(
        `<div class=updateHero><div class=updateGlow>✦</div><h2>${h(data.title || "Что нового в NightVault " + (data.version || ""))}</h2><div class=fileCard><b>Версия ${h(data.version || S.appVersion || "")}</b></div><ul class=changeList>${changes || "<li>Улучшена стабильность приложения.</li>"}</ul><button class=btn onclick='closeModal()'>Понятно</button></div>`,
      ),
    700,
  );
}
function bindUpdaterEvents() {
  try {
    nvBridge.onUpdateAvailable(showUpdateModal);
    nvBridge.onUpdateStatus?.((d) => {
      if (d?.status === "not-available")
        toast(
          "Установлена последняя версия " + (d.version || S.appVersion || ""),
        );
    });
    nvBridge.onUpdateProgress((p) => {
      let bar = $("#updateProgress div");
      if (bar) bar.style.width = (p.percent || 0) + "%";
    });
    nvBridge.onUpdateDownloaded(showUpdateReadyModal);
    nvBridge.onUpdateError((e) =>
      modal(
        `<h2>Ошибка обновления</h2><div class=muted>${h(e.message || e)}</div><button class=btn onclick='closeModal()'>Понятно</button>`,
      ),
    );
    nvBridge.onUpdateStatus((s) => {
      if (s?.status === "not-available")
        toast(
          "Установлена последняя версия: " + (s.version || S.appVersion || ""),
        );
    });
    nvBridge.onChangelog(showChangelogModal);
  } catch {}
}

function p2pNotice(file) {
  if (file && file.size > 50 * 1024 * 1024)
    toast(
      "P2P режим: большой файл будет помечен как direct-transfer. Для реального P2P нужен WebRTC/STUN сервер.",
    );
}

function contactStatusLabel(status) {
  return window.NVContacts?.statusLabel ? window.NVContacts.statusLabel(status) : ({ accepted: "В контактах", incoming: "Входящая заявка", outgoing: "Заявка отправлена", none: "Не в контактах", self: "Это вы" }[status || "none"] || "Не в контактах");
}
function contactDisplay(item) {
  return item.alias || item.user?.displayName || item.user?.username || "контакт";
}
function contactCard(item, status = item.status) {
  const user = item.user || item;
  const alias = item.alias || "";
  const note = item.note || "";
  const favorite = item.favorite ? "★" : "☆";
  const safeUsername = inlineArg(user.username);
  let actions = "";
  if (status === "incoming") {
    actions = `<button class="btn" onclick="acceptContact('${safeUsername}')">Принять</button><button class="btn ghost" onclick="declineContact('${safeUsername}')">Отклонить</button>`;
  } else if (status === "outgoing") {
    actions = `<button class="btn ghost" onclick="removeContact('${safeUsername}')">Отменить</button>`;
  } else if (status === "accepted") {
    actions = `<button class="btn" onclick="startPrivate('${safeUsername}')">Написать</button><button class="btn ghost" onclick="editContact('${safeUsername}')">Заметка</button><button class="btn ghost" onclick="toggleFavoriteContact('${safeUsername}',${item.favorite ? "false" : "true"})">${favorite}</button><button class="btn danger" onclick="removeContact('${safeUsername}')">Удалить</button>`;
  } else if (status !== "self") {
    actions = `<button class="btn" onclick="requestContact('${safeUsername}')">Добавить</button><button class="btn ghost" onclick="startPrivate('${safeUsername}')">Написать</button>`;
  }
  return `<div class="contactCard ${status || "none"}">${av(user)}<div class=rowMain><div class=rowTop><b>${h(contactDisplay(item))}</b><span class="statusPill ${h(user.status || "")}">${h(user.statusText || contactStatusLabel(status))}</span></div><div class=small>@${h(user.username)} · ${h(contactStatusLabel(status))}</div>${alias ? `<div class=contactAlias>Имя: ${h(alias)}</div>` : ""}${note ? `<div class=contactNote>${h(note)}</div>` : ""}</div><div class=contactActions>${actions}</div></div>`;
}
function contactListHtml(items, status) {
  return (items || []).map((item) => contactCard(item, status || item.status)).join("") || `<div class=emptyMini>Пока пусто</div>`;
}
function contactsPage() {
  const accepted = S.contacts?.accepted || [];
  const incoming = S.contacts?.incoming || [];
  const outgoing = S.contacts?.outgoing || [];
  const all = [...accepted];
  const q = String(S.contactsQuery || "").toLowerCase();
  const filtered = q ? all.filter((item) => (contactDisplay(item) + " " + item.user.username + " " + item.note).toLowerCase().includes(q)) : all;
  return `<div class="sidePad contactsPage"><div class=contactsHero><div><h1>Контакты</h1><p class=muted>1.0.9: отдельная система заявок, избранных, заметок и приватности “только контакты”.</p></div><button class="btn ghost" onclick="loadContacts(true)">Обновить</button></div><div class=contactStats><div><b>${accepted.length}</b><span>контактов</span></div><div><b>${incoming.length}</b><span>входящих</span></div><div><b>${outgoing.length}</b><span>исходящих</span></div></div><div class=contactsSearch><input id=person class=field placeholder="Ник или имя пользователя"><button class=btn onclick="findPerson()">Найти</button></div><div id=people></div>${incoming.length ? `<h2>Входящие заявки</h2>${contactListHtml(incoming, "incoming")}` : ""}${outgoing.length ? `<h2>Отправленные заявки</h2>${contactListHtml(outgoing, "outgoing")}` : ""}<h2>Мои контакты</h2><input id=contactsLocalSearch class=field placeholder="Фильтр по контактам, заметкам" value="${h(S.contactsQuery || "")}">${contactListHtml(filtered, "accepted")}<h2>Глобальный поиск</h2><input id=global class=field placeholder="Сообщения, файлы"><button class=btn onclick="globalSearch()">Искать</button><div id=globalOut></div></div>`;
}
function bind() {
  $("#winClose")?.addEventListener("click", () => nvBridge.close());
  $("#winMin")?.addEventListener("click", () => nvBridge.minimize());
  $("#winFull")?.addEventListener("click", () => nvBridge.toggleFull());
  $("#closeAppBtn")?.addEventListener("click", () => nvBridge.close());
  $("#minAppBtn")?.addEventListener("click", () => nvBridge.minimize());
  $$('img[data-fallback]').forEach((img) => {
    if (img.dataset.nvImgBound) return;
    img.dataset.nvImgBound = "1";
    img.addEventListener("error", () => {
      const fallback = img.dataset.fallback || "?";
      const replacement = document.createElement("div");
      replacement.className = safeClassList(img.className || "avatar");
      replacement.textContent = fallback;
      try { img.replaceWith(replacement); } catch { img.style.visibility = "hidden"; }
    }, { once: true });
  });
  let q = $("#q");
  if (q)
    q.oninput = (e) => {
      S.q = e.target.value;
      renderChatListOnly();
    };
  ensureChatBottomWatch();
  let txt = $("#txt");
  if (txt) {
    txt.value = S.editId ? findMsg(S.editId)?.text || "" : getDraft(S.active);
    txt.focus();
    txt.oninput = (e) => {
      if (!S.editId) setDraft(S.active, e.target.value);
      touchActivity();
    };
    txt.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
      } else if (sock && S.active) {
        sock.send(
          JSON.stringify({ type: "typing", chatId: S.active, active: true }),
        );
      }
    };
    setTimeout(() => scrollChatBottom(false), 0);
  }
  let contactSearch = $("#contactsLocalSearch");
  if (contactSearch) {
    contactSearch.oninput = (e) => {
      S.contactsQuery = e.target.value;
      render();
    };
  }
  let cs = $("#chatSearch");
  if (cs)
    cs.oninput = (e) => {
      S.chatSearch = e.target.value;
      renderMessagesOnly(false);
    };
  let ds = $("#dateSearch");
  if (ds)
    ds.oninput = (e) => {
      S.dateFilter = e.target.value;
      renderMessagesOnly(false);
    };
  let mf = $("#mediaFilter");
  if (mf) {
    mf.value = S.mediaFilter || "all";
    mf.onchange = (e) => {
      S.mediaFilter = e.target.value;
      renderMessagesOnly(false);
    };
  }
  let th = $("#theme");
  if (th) {
    th.value = S.theme;
    th.onchange = (e) => {
      S.theme = e.target.value;
      ensureAccentForTheme(S.theme);
      saveVisualOnly();
      render();
    };
  }
  let cb = $("#chatBg");
  if (cb) {
    cb.value = S.chatBg;
    cb.onchange = (e) => {
      S.chatBg = e.target.value;
      saveVisualOnly();
      render();
    };
  }
  let fs = $("#fontSize");
  if (fs) {
    fs.value = S.fontSize;
    fs.oninput = (e) => {
      S.fontSize = Number(e.target.value);
      saveVisualOnly();
    };
  }
  let ff = $("#fontFamily");
  if (ff) {
    ff.value = S.fontFamily;
    ff.onchange = (e) => {
      S.fontFamily = e.target.value;
      saveVisualOnly();
    };
  }
  const uiDensity = $("#uiDensity");
  if (uiDensity) {
    uiDensity.value = S.uiDensity || "comfortable";
    uiDensity.onchange = (e) => {
      S.uiDensity = e.target.value;
      saveVisualOnly();
    };
  }
  const motion = $("#motion");
  if (motion) {
    motion.value = S.motion || "balanced";
    motion.onchange = (e) => {
      S.motion = e.target.value;
      saveVisualOnly();
    };
  }
  const bubbleStyle = $("#bubbleStyle");
  if (bubbleStyle) {
    bubbleStyle.value = S.bubbleStyle || "modern";
    bubbleStyle.onchange = (e) => {
      S.bubbleStyle = e.target.value;
      saveVisualOnly();
    };
  }
  const sidebarWidth = $("#sidebarWidth");
  if (sidebarWidth) {
    sidebarWidth.value = S.sidebarWidth || "normal";
    sidebarWidth.onchange = (e) => {
      S.sidebarWidth = e.target.value;
      saveVisualOnly();
    };
  }
  const rightPanel = $("#rightPanel");
  if (rightPanel) {
    rightPanel.value = S.rightPanel ? "1" : "0";
    rightPanel.onchange = (e) => {
      S.rightPanel = e.target.value !== "0";
      saveVisualOnly();
      render();
    };
  }
  const showAvatars = $("#showAvatars");
  if (showAvatars) {
    showAvatars.checked = S.showAvatars;
    showAvatars.onchange = (e) => {
      S.showAvatars = e.target.checked;
      saveVisualOnly();
    };
  }
  const fr = $("#avatarFrame");
  if (fr) {
    fr.value = S.user.avatarFrame || "";
  }
  const privacy = S.user?.privacy || {};
  if ($("#privacyAvatar")) $("#privacyAvatar").value = privacy.avatar || "all";
  if ($("#privacyLastSeen")) $("#privacyLastSeen").value = privacy.lastSeen || "all";
  if ($("#privacyStatus")) $("#privacyStatus").value = privacy.status || "all";
  if ($("#presenceMode")) $("#presenceMode").value = privacy.presenceMode || "online";
  loadStatsBox();
  let ac = $("#accent");
  if (ac)
    ac.oninput = (e) => {
      S.accent = e.target.value;
      localStorage.nvAccentCustom = "1";
      saveVisualOnly();
    };
  let mic = $("#mic");
  if (mic) {
    mic.value = S.micId || "";
    mic.onchange = (e) => {
      S.micId = e.target.value;
      localStorage.nvMicId = S.micId;
    };
  }
  renderTyping();
  updateVoiceUI();
  window.NVActionBridge?.bind(app);
}
function saveVisualOnly() {
  if (S.chatBg === "frost") S.chatBg = "none";
  localStorage.nvTheme = S.theme;
  localStorage.nvAccent = S.accent;
  localStorage.nvChatBg = S.chatBg;
  localStorage.nvFontSize = S.fontSize;
  localStorage.nvFontFamily = S.fontFamily;
  localStorage.nvDensity = S.uiDensity || "comfortable";
  localStorage.nvMotion = S.motion || "balanced";
  localStorage.nvBubbleStyle = S.bubbleStyle || "modern";
  localStorage.nvSidebarWidth = S.sidebarWidth || "normal";
  localStorage.nvRightPanel = "1";
  localStorage.nvShowAvatars = S.showAvatars ? "1" : "0";
  applyVisualPrefs();
}

function quickTheme(theme) {
  S.theme = theme;
  ensureAccentForTheme(theme);
  if (theme === "aurora") S.chatBg = "aurora";
  if (theme === "ivory" && S.chatBg === "frost") S.chatBg = "none";
  saveVisualOnly();
  render();
}
function setAccent(color) {
  S.accent = color;
  localStorage.nvAccentCustom = "1";
  saveVisualOnly();
  const input = document.querySelector("#accent");
  if (input) input.value = color;
}
async function chooseCustomWallpaper() {
  const files = await pickDomFiles({ accept: "image/*", multiple: false });
  const file = files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) return toast("Фон слишком большой: максимум 3 MB для локальной темы.");
  const reader = new FileReader();
  reader.onload = () => {
    localStorage.nvCustomWallpaper = String(reader.result || "");
    S.chatBg = "custom";
    saveVisualOnly();
    toast("Фон чата обновлён.");
    render();
  };
  reader.readAsDataURL(file);
}
function saveCustomThemePreset() {
  const name = prompt("Название своей темы:", "Моя тема");
  if (!name) return;
  const themes = readCustomThemes();
  const id = "custom_" + Date.now().toString(36);
  themes.push({ id, name: String(name).slice(0, 40), accent: S.accent, bg: getComputedStyle(document.documentElement).getPropertyValue("--chatBg").trim(), panel: getComputedStyle(document.documentElement).getPropertyValue("--panel").trim(), panel2: getComputedStyle(document.documentElement).getPropertyValue("--panel2").trim(), line: getComputedStyle(document.documentElement).getPropertyValue("--line").trim(), text: getComputedStyle(document.documentElement).getPropertyValue("--text").trim(), muted: getComputedStyle(document.documentElement).getPropertyValue("--muted").trim(), mine: getComputedStyle(document.documentElement).getPropertyValue("--mine").trim(), msg: getComputedStyle(document.documentElement).getPropertyValue("--msg").trim() });
  localStorage.nvCustomThemes = JSON.stringify(themes.slice(-24));
  S.theme = id;
  saveVisualOnly();
  toast("Своя тема сохранена.");
  render();
}
function exportThemePreset() {
  const payload = { version: 1, exportedAt: Date.now(), theme: S.theme, accent: S.accent, chatBg: S.chatBg, customThemes: readCustomThemes(), wallpaper: localStorage.nvCustomWallpaper || "" };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "nightvault-theme.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importThemePreset() {
  const files = await pickDomFiles({ accept: "application/json,.json", multiple: false });
  const file = files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (Array.isArray(payload.customThemes)) localStorage.nvCustomThemes = JSON.stringify(payload.customThemes.slice(0, 24));
    if (payload.wallpaper) localStorage.nvCustomWallpaper = payload.wallpaper;
    if (payload.theme) S.theme = payload.theme;
    if (payload.accent) S.accent = payload.accent;
    if (payload.chatBg) S.chatBg = payload.chatBg;
    saveVisualOnly();
    toast("Тема импортирована.");
    render();
  } catch (error) {
    toast("Не удалось импортировать тему: " + error.message);
  }
}
let nvChatObserver = null;
let nvChatResizeObserver = null;
function chatDistanceFromBottom(container = $("#msgs")) {
  if (!container) return 0;
  return Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
}
function isNearChatBottom(container = $("#msgs"), threshold = 120) {
  return !container || chatDistanceFromBottom(container) <= threshold;
}
function scrollChatBottom(smooth = true) {
  const m = $("#msgs");
  if (m) {
    const run = () => {
      const top = Math.max(0, m.scrollHeight - m.clientHeight);
      if (smooth && m.scrollTo) m.scrollTo({ top, behavior: "smooth" });
      else m.scrollTop = top;
      S.chatPinnedBottom = true;
    };
    run();
    requestAnimationFrame(run);
    setTimeout(run, 40);
    setTimeout(run, 140);
    setTimeout(run, 320);
  }
  toggleBottomBtn();
}
function ensureChatBottomWatch() {
  const m = $("#msgs");
  if (!m) {
    try { nvChatObserver?.disconnect?.(); nvChatResizeObserver?.disconnect?.(); } catch {}
    nvChatObserver = null;
    nvChatResizeObserver = null;
    return;
  }
  if (m.dataset.nvBottomWatch === "1") return;
  m.dataset.nvBottomWatch = "1";
  try { nvChatObserver?.disconnect?.(); } catch {}
  try { nvChatResizeObserver?.disconnect?.(); } catch {}
  const lock = () => { if (S.tab === "chats" && S.chatPinnedBottom) scrollChatBottom(false); else toggleBottomBtn(); };
  if (typeof MutationObserver === "function") {
    nvChatObserver = new MutationObserver(() => requestAnimationFrame(lock));
    nvChatObserver.observe(m.querySelector(".messagesInner") || m, { childList: true, subtree: true });
  }
  if (typeof ResizeObserver === "function") {
    nvChatResizeObserver = new ResizeObserver(() => requestAnimationFrame(lock));
    nvChatResizeObserver.observe(m);
    const inner = m.querySelector(".messagesInner");
    if (inner) nvChatResizeObserver.observe(inner);
  }
}
function toggleBottomBtn() {
  let m = $("#msgs"),
    b = $("#bottomBtn");
  if (!m || !b) return;
  const far = chatDistanceFromBottom(m) > 260;
  b.style.display = far ? "grid" : "none";
  S.chatPinnedBottom = !far || isNearChatBottom(m, 120);
}
function renderMessagesOnly(keepScroll = true) {
  const container = $("#msgs");
  if (!container || !S.active) return;
  const nearBottom = isNearChatBottom(container, 160);
  const older = S.nextCursors[S.active]
    ? '<button class="btn ghost loadOlder" onclick="loadOlderMessages()">Загрузить более ранние сообщения</button>'
    : "";
  const inner = container.querySelector(".messagesInner") || container;
  inner.innerHTML =
    older +
    visibleMessages(S.active)
      .map((message) => msgHtml(message))
      .join("");
  if (!container.querySelector("#bottomBtn")) {
    container.insertAdjacentHTML("beforeend", '<button id="bottomBtn" class="bottomBtn" onclick="scrollChatBottom(false)">↓</button>');
  }
  if (!keepScroll || nearBottom) scrollChatBottom(false);
  renderTyping();
  toggleBottomBtn();
}
function renderTyping() {
  let t = $("#typing");
  if (t && S.active)
    t.textContent = S.typing[S.active]
      ? S.typing[S.active] + " печатает..."
      : "";
}

function offlineQueueKey() {
  return "nvOfflineQueue_" + (S.user?.username || "guest");
}
function loadOfflineQueue() {
  try {
    S.offlineQueue = JSON.parse(localStorage[offlineQueueKey()] || "[]").slice(0, 100);
  } catch {
    S.offlineQueue = [];
  }
}
function saveOfflineQueue() {
  try {
    localStorage[offlineQueueKey()] = JSON.stringify((S.offlineQueue || []).slice(-100));
  } catch {}
}

async function buildOutgoingMessagePayload(chatId, text, attachment) {
  const plainAttachment = attachment?._plainAttachment
    ? { ...attachment._plainAttachment, id: attachment.id, url: attachment.url }
    : attachment
      ? { id: attachment.id, url: attachment.url, name: attachment.name, type: attachment.type, size: attachment.size, voice: attachment.voice, duration: attachment.duration }
      : null;
  const plaintext = { text: String(text || ""), attachment: plainAttachment };
  if (!S.e2ee?.enabled) return { text: plaintext.text, attachment };
  try {
    const envelope = await encryptPayloadForChat(chatId, plaintext);
    if (!envelope) throw new Error("нет ключей устройств");
    const serverAttachment = attachment ? { id: attachment.id, voice: attachment.voice, duration: attachment.duration } : null;
    return { text: "", e2ee: envelope, attachment: serverAttachment };
  } catch (error) {
    toast("E2EE: отправка без шифрования невозможна — " + (error.message || error));
    throw error;
  }
}
function queueOfflineMessage(chatId, text, attachment, replyTo) {
  const item = {
    localId: "local_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    chatId,
    text,
    attachment: attachment || null,
    replyTo: replyTo || null,
    createdAt: Date.now(),
  };
  S.offlineQueue = S.offlineQueue || [];
  S.offlineQueue.push(item);
  saveOfflineQueue();
  S.messages[chatId] = S.messages[chatId] || [];
  S.messages[chatId].push({
    id: item.localId,
    chatId,
    from: S.user.username,
    text,
    attachment: attachment || null,
    replyTo: replyTo || null,
    reactions: {},
    createdAt: item.createdAt,
    deliveredTo: [],
    readBy: [],
    pending: true,
  });
  renderMessagesOnly(false);
}
async function flushOfflineQueue() {
  if (!S.token || !S.user || !S.offlineQueue?.length) return;
  const remaining = [];
  for (const item of S.offlineQueue) {
    try {
      const payload = await buildOutgoingMessagePayload(item.chatId, item.text, item.attachment);
      const response = await api("/chats/" + item.chatId + "/messages", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          replyTo: item.replyTo,
          ttl: 0,
        }),
      });
      S.messages[item.chatId] = (S.messages[item.chatId] || []).filter(
        (message) => message.id !== item.localId,
      );
      S.messages[item.chatId].push(response.message);
      await hydrateAssets([response.message]);
    } catch (error) {
      remaining.push(item);
    }
  }
  S.offlineQueue = remaining;
  saveOfflineQueue();
  if (!remaining.length) toast("Очередь offline-сообщений отправлена.");
  await loadChats(false).catch(() => {});
  renderChatListOnly();
  renderMessagesOnly(false);
}
async function sendMsg(att = null) {
  if (!S.active) return toast("Сначала открой чат");
  let txt = $("#txt")?.value || "";
  try {
    if (S.editId && !att) {
      await editMsgSave(S.editId, txt);
      return;
    }
    if (!txt.trim() && !att) return;
    const payload = await buildOutgoingMessagePayload(S.active, txt, att);
    let r = await api("/chats/" + S.active + "/messages", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        replyTo: S.replyTo,
        ttl: 0,
      }),
    });
    await decryptMessage(r.message);
    S.replyTo = null;
    if ($("#txt")) $("#txt").value = "";
    setDraft(S.active, "");
    S.messages[S.active] = S.messages[S.active] || [];
    if (!S.messages[S.active].some((m) => m.id === r.message.id))
      S.messages[S.active].push(r.message);
    await hydrateAssets([r.message]);
    await loadChats(false);
    renderChatListOnly();
    renderMessagesOnly(false);
  } catch (e) {
    if (!att && txt.trim() && S.active) {
      queueOfflineMessage(S.active, txt, null, S.replyTo);
      S.replyTo = null;
      if ($("#txt")) $("#txt").value = "";
      setDraft(S.active, "");
      toast("Нет соединения: сообщение добавлено в offline-очередь.");
      return;
    }
    toast("Ошибка отправки: " + e.message);
  }
}
function pickDomFiles({ accept = "", multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = [...input.files];
      input.remove();
      resolve(files);
    });
    input.click();
  });
}

function validateClientAttachment(file) {
  const type = String(file.type || "");
  const name = String(file.name || "file").toLowerCase();
  const blocked = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|html?|svg|xml)$/i.test(name);
  if (blocked) throw new Error("Этот тип файла запрещён для безопасности.");
  const limits = window.NVRendererCore || {};
  let limit = limits.maxAttachmentBytes || 50 * 1024 * 1024;
  if (type.startsWith("image/")) limit = limits.maxImageBytes || 15 * 1024 * 1024;
  else if (type.startsWith("video/")) limit = limits.maxVideoBytes || 100 * 1024 * 1024;
  else if (type.startsWith("audio/")) limit = limits.maxAudioBytes || 30 * 1024 * 1024;
  if (file.size > limit) throw new Error("Файл превышает лимит " + fmt(limit) + ".");
}
async function uploadBrowserFile(file) {
  if (!(file instanceof Blob)) throw new Error("Некорректный файл.");
  validateClientAttachment(file);
  p2pNotice(file);
  const originalFile = file;
  if (S.e2ee?.enabled) file = await encryptFileForUpload(file);
  const form = new FormData();
  form.append("file", file, file.name || `file-${Date.now()}`);
  const uploaded = await api("/files", {
    method: "POST",
    body: form,
    timeout: 120000,
  });
  if (file.__nvPlain) {
    uploaded._plainAttachment = { ...file.__nvPlain, id: uploaded.id, url: uploaded.url };
    uploaded.name = file.__nvPlain.name;
    uploaded.type = file.__nvPlain.type;
    uploaded.size = file.__nvPlain.size;
  }
  return uploaded;
}
async function attachFiles() {
  try {
    if (!S.active) return toast("Сначала открой чат");
    const files = await pickDomFiles({ multiple: true });
    if (!files.length) return;
    toast("Загрузка файлов: " + files.length);
    for (const f of files) {
      const r = await uploadBrowserFile(f);
      await sendMsg(r);
    }
  } catch (e) {
    toast("Файл не отправлен: " + (e.message || e));
  }
}
async function changeAvatar() {
  let hadPreview = false;
  try {
    const files = await pickDomFiles({ accept: "image/png,image/jpeg,image/webp,image/gif", multiple: false });
    const file = files[0];
    if (!file) return;
    await validatePickedProfileImage(file, { label: "Аватар", maxBytes: 8 * 1024 * 1024, maxSide: 4096 });
    S.assetUploading.avatar = true;
    setTemporaryProfilePreview("avatar", file);
    hadPreview = true;
    safeProfileRenderAfterAsset("Аватар preview");
    toast("Загружаю аватар…");
    const form = new FormData();
    form.append("file", file, file.name || `avatar-${Date.now()}`);
    const response = await api("/avatar", {
      method: "POST",
      body: form,
      timeout: 120000,
    });
    if (!response.avatar) throw new Error("сервер не вернул ссылку на аватар");
    const ref = attachmentRef(response.avatar);
    const previewUrl = ref ? setProfileAssetPreview(ref, file) : S.user._avatarPreviewUrl;
    S.user = { ...S.user, avatar: response.avatar, _avatarPreviewUrl: previewUrl || S.user._avatarPreviewUrl };
    await loadChats(false).catch((error) => console.warn("NightVault chats refresh after avatar failed", error?.message || error));
    if (ref) hydrateFile(ref, { force: false }).catch(() => {});
    toast("Аватар обновлён");
  } catch (error) {
    if (hadPreview) settleTemporaryProfilePreview("avatar", "");
    toast("Аватар не загружен: " + (error.message || error));
  } finally {
    if (S.assetUploading) S.assetUploading.avatar = false;
    safeProfileRenderAfterAsset("Аватар");
  }
}
async function saveProfile() {
  try {
    let r = await api("/me", {
      method: "PUT",
      body: JSON.stringify({
        displayName: $("#pd")?.value ?? S.user.displayName,
        bio: $("#pb")?.value ?? S.user.bio ?? "",
        profileColor: $("#profileColor")?.value || S.user.profileColor,
        avatarFrame: $("#avatarFrame")?.value || "",
        privacy: {
          avatar: $("#privacyAvatar")?.value || S.user.privacy?.avatar || "all",
          lastSeen: $("#privacyLastSeen")?.value || S.user.privacy?.lastSeen || "all",
          status: $("#privacyStatus")?.value || S.user.privacy?.status || "all",
          presenceMode: $("#presenceMode")?.value || S.user.privacy?.presenceMode || "online",
        },
      }),
    });
    S.user = r.user || S.user;
    if (S.user?.avatar) nvAssetState.failed.delete(S.user.avatar);
    if (S.user?.banner) nvAssetState.failed.delete(S.user.banner);
    await hydrateAssets([S.user]);
    toast("Профиль сохранён");
    render();
  } catch (e) {
    toast(e.message);
  }
}

async function checkServerConnection() {
  try {
    const response = await fetch(getServerHttp() + "/api/health", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    S.transportSecurity =
      Boolean(data.transportSecurity) || getServerHttp().startsWith("https://");
    toast(
      "Сервер OK: v" +
        (data.version || "?") +
        (S.transportSecurity ? " · TLS" : " · без TLS"),
    );
  } catch (error) {
    toast("Сервер недоступен: " + (error.message || error));
  }
}
async function saveServerConnection() {
  const oldServer = getServerHttp();
  const nextServer = setServerUrl($("#serverSettings")?.value || oldServer);
  toast("Адрес сервера сохранён: " + nextServer);
  if (nextServer !== oldServer && S.user) {
    try {
      sock?.close();
    } catch {}
    clearBlobUrls();
    await nvBridge.authClearCurrent();
    S = defaultState();
    S.accounts = (await nvBridge.authList()) || [];
    toast("Для нового сервера войдите заново.");
    renderAuth();
  }
}
async function saveSettings() {
  try {
    if ($("#theme")) S.theme = $("#theme").value || S.theme;
    if ($("#accent")) S.accent = $("#accent").value || S.accent;
    if ($("#mic")) S.micId = $("#mic").value || S.micId || "";
    if ($("#blur")) S.blur = Boolean($("#blur").checked);
    if ($("#chatBg")) S.chatBg = $("#chatBg").value || S.chatBg;
    if ($("#fontSize")) S.fontSize = Number($("#fontSize").value || S.fontSize);
    if ($("#fontFamily")) S.fontFamily = $("#fontFamily").value || S.fontFamily;
    if ($("#virtualWindow")) S.virtualWindow = Math.max(80, Math.min(700, Number($("#virtualWindow").value || S.virtualWindow || 220)));
    if ($("#uiDensity")) S.uiDensity = $("#uiDensity").value || S.uiDensity;
    if ($("#motion")) S.motion = $("#motion").value || S.motion;
    if ($("#bubbleStyle")) S.bubbleStyle = $("#bubbleStyle").value || S.bubbleStyle;
    if ($("#sidebarWidth")) S.sidebarWidth = $("#sidebarWidth").value || S.sidebarWidth;
    S.rightPanel = true;
    if ($("#showAvatars")) S.showAvatars = Boolean($("#showAvatars").checked);

    const lockInput = $("#lock");
    const autoLock = lockInput
      ? Math.max(0, Math.min(1440, Number(lockInput.value || 0)))
      : Number(localStorage.nvAutoLock || 0);
    const localSecret = $("#localLockSecret")?.value || "";
    if ($("#clearLocalLock")?.checked) {
      localStorage.removeItem("nvLockRecord");
      S.locked = false;
    } else if (localSecret) {
      await setLocalLock(localSecret);
    }

    if ($("#closeToTray") || $("#minimizeToTray") || $("#startMaximized")) {
      S.windowPrefs = await nvBridge.windowPrefsSet({
        closeToTray: $("#closeToTray") ? Boolean($("#closeToTray").checked) : Boolean(S.windowPrefs?.closeToTray),
        minimizeToTray: $("#minimizeToTray") ? Boolean($("#minimizeToTray").checked) : Boolean(S.windowPrefs?.minimizeToTray),
        startMaximized: $("#startMaximized") ? Boolean($("#startMaximized").checked) : Boolean(S.windowPrefs?.startMaximized),
      });
    }

    localStorage.nvAutoLock = String(autoLock);
    localStorage.nvTheme = S.theme;
    localStorage.nvAccent = S.accent;
    localStorage.nvAccentCustom = "1";
    localStorage.nvBlur = S.blur ? "1" : "0";
    localStorage.nvMicId = S.micId;
    localStorage.nvMessageSound = $("#messageSound") ? ($("#messageSound").checked ? "1" : "0") : (localStorage.nvMessageSound || "1");
    localStorage.nvToastPreview = $("#toastPreview") ? ($("#toastPreview").checked ? "1" : "0") : (localStorage.nvToastPreview || "1");
    localStorage.nvVirtualWindow = String(S.virtualWindow || 220);
    saveVisualOnly();
    const response = await api("/me", {
      method: "PUT",
      body: JSON.stringify({
        settings: {
          notify: $("#notify") ? Boolean($("#notify").checked) : S.settings.notify !== false,
          chatBg: S.chatBg,
          fontSize: S.fontSize,
          fontFamily: S.fontFamily,
          theme: S.theme,
          accent: S.accent,
          density: S.uiDensity,
          motion: S.motion,
          bubbleStyle: S.bubbleStyle,
          customThemes: readCustomThemes(),
          rightPanel: S.rightPanel,
        },
      }),
    });
    S.settings = response.settings || S.settings;
    toast("Настройки сохранены");
    render();
  } catch (error) {
    toast(error.message || error);
  }
}

async function setupTwoFactor() {
  const password = prompt("Введите текущий пароль для настройки TOTP 2FA:");
  if (!password) return;
  try {
    const setup = await api("/2fa/setup", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    modal(
      `<h2>Настройка TOTP 2FA</h2><p>Добавьте этот секрет в приложение-аутентификатор:</p><div class=fileCard><code>${h(setup.secret)}</code></div><p class=small>URI для ручного импорта:</p><textarea class=field readonly>${h(setup.otpauthUrl)}</textarea><input id=totpEnableCode class=field inputmode=numeric maxlength=6 placeholder="6-значный код"><button class=btn onclick="finishTwoFactor()">Подтвердить и включить</button><button class='btn ghost' onclick='closeModal()'>Отмена</button>`,
    );
  } catch (error) {
    toast("2FA не настроена: " + error.message);
  }
}
async function finishTwoFactor() {
  const code = $("#totpEnableCode")?.value || "";
  try {
    const result = await api("/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    S.settings.twoFactorEnabled = true;
    modal(
      `<h2>2FA включена</h2><p>Сохраните recovery-коды в надёжном месте. Каждый код одноразовый.</p><textarea class=field readonly rows=10>${h((result.recoveryCodes || []).join("\n"))}</textarea><button class=btn onclick='closeModal();render()'>Я сохранил коды</button>`,
      { lock: true },
    );
  } catch (error) {
    toast("Код не подтверждён: " + error.message);
  }
}
async function disableTwoFactor() {
  const password = prompt("Введите текущий пароль:");
  if (!password) return;
  const code = prompt("Введите TOTP или recovery-код:");
  if (!code) return;
  try {
    await api("/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    });
    S.settings.twoFactorEnabled = false;
    toast("2FA отключена");
    render();
  } catch (error) {
    toast("2FA не отключена: " + error.message);
  }
}
async function changePassword() {
  const oldPassword = $("#oldPassword")?.value || "";
  const newPassword = $("#newPassword")?.value || "";
  if (newPassword.length < 10)
    return toast("Новый пароль должен содержать минимум 10 символов.");
  try {
    await api("/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if ($("#oldPassword")) $("#oldPassword").value = "";
    if ($("#newPassword")) $("#newPassword").value = "";
    toast("Пароль изменён; другие сессии завершены.");
  } catch (error) {
    toast("Пароль не изменён: " + error.message);
  }
}
async function findPerson() {
  try {
    const raw = $("#person")?.value || "";
    let q = window.NVContacts?.normalizeSearch ? window.NVContacts.normalizeSearch(raw) : raw.trim().toLowerCase().replace(/^@+/, "");
    if (q.length < 2) return toast("Введите минимум 2 символа для поиска.");
    let r = await api("/search?q=" + encodeURIComponent(q));
    await hydrateAssets(r.users || []);
    $("#people").innerHTML =
      (r.users || [])
        .map((u) => contactCard({ user: u, status: u.contact || "none" }, u.contact || "none"))
        .join("") || "<p class=muted>Не найдено</p>";
  } catch (e) {
    toast(e.message);
  }
}
async function requestContact(encodedUsername) {
  try {
    const username = decodeURIComponent(encodedUsername);
    const response = await api("/contacts/" + encodeURIComponent(username) + "/request", { method: "POST", body: "{}" });
    S.contacts = response.contacts || S.contacts;
    await hydrateAssets([...(S.contacts.accepted || []).map((item) => item.user), ...(S.contacts.incoming || []).map((item) => item.user), ...(S.contacts.outgoing || []).map((item) => item.user)]);
    toast(response.relation === "accepted" ? "Контакт добавлен." : "Заявка отправлена.");
    render();
  } catch (e) { toast("Контакт не добавлен: " + e.message); }
}
async function acceptContact(encodedUsername) {
  try {
    const username = decodeURIComponent(encodedUsername);
    const response = await api("/contacts/" + encodeURIComponent(username) + "/accept", { method: "POST", body: "{}" });
    S.contacts = response.contacts || S.contacts;
    await hydrateAssets([...(S.contacts.accepted || []).map((item) => item.user)]);
    toast("Заявка принята.");
    render();
  } catch (e) { toast("Заявка не принята: " + e.message); }
}
async function declineContact(encodedUsername) {
  try {
    const username = decodeURIComponent(encodedUsername);
    const response = await api("/contacts/" + encodeURIComponent(username) + "/decline", { method: "POST", body: "{}" });
    S.contacts = response.contacts || S.contacts;
    toast("Заявка отклонена.");
    render();
  } catch (e) { toast("Заявка не отклонена: " + e.message); }
}
async function removeContact(encodedUsername) {
  try {
    const username = decodeURIComponent(encodedUsername);
    if (!confirm("Удалить @" + username + " из контактов?")) return;
    const response = await api("/contacts/" + encodeURIComponent(username), { method: "DELETE" });
    S.contacts = response.contacts || S.contacts;
    toast("Контакт удалён.");
    render();
  } catch (e) { toast("Контакт не удалён: " + e.message); }
}
function editContact(encodedUsername) {
  const username = decodeURIComponent(encodedUsername);
  const item = (S.contacts.accepted || []).find((contact) => contact.user.username === username);
  if (!item) return toast("Контакт не найден.");
  modal(`<h2>Контакт @${h(username)}</h2><label>Локальное имя<input id=contactAlias class=field value="${h(item.alias || "")}" placeholder="Например: Работа / лучший друг"></label><label>Заметка<textarea id=contactNote class=field placeholder="Личная заметка, видна только тебе">${h(item.note || "")}</textarea></label><label class=fileCard><input id=contactFavorite type=checkbox ${item.favorite ? "checked" : ""}> В избранные контакты</label><button class=btn onclick="saveContactMeta('${encodedUsername}')">Сохранить</button>`);
}
async function saveContactMeta(encodedUsername) {
  try {
    const username = decodeURIComponent(encodedUsername);
    const response = await api("/contacts/" + encodeURIComponent(username), {
      method: "PUT",
      body: JSON.stringify({ alias: $("#contactAlias")?.value || "", note: $("#contactNote")?.value || "", favorite: !!$("#contactFavorite")?.checked }),
    });
    S.contacts = response.contacts || S.contacts;
    closeModal();
    toast("Контакт обновлён.");
    render();
  } catch (e) { toast("Контакт не обновлён: " + e.message); }
}
async function toggleFavoriteContact(encodedUsername, favorite) {
  try {
    const username = decodeURIComponent(encodedUsername);
    const item = (S.contacts.accepted || []).find((contact) => contact.user.username === username) || {};
    const response = await api("/contacts/" + encodeURIComponent(username), { method: "PUT", body: JSON.stringify({ alias: item.alias || "", note: item.note || "", favorite }) });
    S.contacts = response.contacts || S.contacts;
    render();
  } catch (e) { toast("Избранное не изменено: " + e.message); }
}
async function startPrivate(u) {
  const username = decodeURIComponent(String(u || ""));
  let r = await api("/chats/private/" + encodeURIComponent(username), { method: "POST", body: "{}" });
  await loadChats(false);
  S.tab = "chats";
  await openChat(r.chat.id);
}
function newGroup() {
  modal(
    `<h2>Новая группа</h2><input id=grpTitle class=field placeholder="Название группы"><textarea id=grpMembers class=field placeholder="Участники через запятую: user1,user2"></textarea><label class=fileCard><input id=grpChannel type=checkbox> Создать как канал</label><h3>Права</h3><label class=fileCard><input id=permWrite type=checkbox checked> Участники могут писать</label><label class=fileCard><input id=permInvite type=checkbox checked> Участники могут приглашать</label><label class=fileCard><input id=permAvatar type=checkbox> Участники могут менять аватар/описание</label><button class=btn onclick="createGroupFromModal()">Создать</button>`,
  );
}
async function createGroupFromModal() {
  try {
    let title = $("#grpTitle").value.trim();
    if (!title) return toast("Введите название");
    let members = ($("#grpMembers").value || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    let channel = !!$("#grpChannel").checked;
    let permissions = {
      write: !!$("#permWrite").checked,
      invite: !!$("#permInvite").checked,
      avatar: !!$("#permAvatar").checked,
    };
    let r = await api("/chats/group", {
      method: "POST",
      body: JSON.stringify({ title, members, channel, permissions }),
    });
    closeModal();
    await loadChats(false);
    S.tab = "chats";
    await openChat(r.chat.id);
  } catch (e) {
    toast("Группа не создана: " + e.message);
  }
}
async function globalSearch() {
  try {
    let r = await api(
      "/search-global?q=" + encodeURIComponent($("#global").value),
    );
    $("#globalOut").innerHTML =
      (r.results || [])
        .map(
          (x) =>
            `<div class=row onclick="S.tab='chats';openChat('${x.chat.id}')"><b>${h(x.chat.title || x.chat.other?.displayName || "чат")}</b><div class=small>${h(x.message.text || x.message.attachment?.name || "")}</div></div>`,
        )
        .join("") || "<p class=muted>Нет результатов</p>";
  } catch (e) {
    toast(e.message);
  }
}
function showProfile(id) {
  let c = S.chats.find((x) => x.id === id);
  if (!c) return;
  let u =
    c.type === "private"
      ? c.other
      : {
          displayName: c.title,
          username: c.type,
          avatar: c.avatar,
          bio: c.description,
        };
  modal(
    `<div class=profileHero>${av(u, "bigAvatar")}</div><h2>${h(u.displayName)}</h2><div class=muted>@${h(u.username)}</div><p>${h(u.bio || "Нет описания")}</p>${c.type === "private" ? `<div class=fileCard onclick="viewRep('${u.username}')">⭐ Репутация: <b id='rep_${u.username}'>загрузка...</b></div><button class='btn ghost' onclick="repMenu('${u.username}','praise')">Похвалить</button><button class='btn danger' onclick="repMenu('${u.username}','report')">Пожаловаться</button>` : ""}<button class=btn onclick="closeModal()">Закрыть</button>${c.type === "private" ? `<button class='btn danger' onclick="blockUser('${u.username}')">Заблокировать</button>` : ""}`,
  );
}

const repPraise = [
  "Помог в общении",
  "Приятный собеседник",
  "Надёжный пользователь",
  "Не спамит",
  "Полезная информация",
];
const repReport = [
  "Спам",
  "Оскорбления",
  "Подозрительное поведение",
  "Обман",
  "Вредоносные файлы",
];
function repStatus(score) {
  if (score >= 8) return "отличная";
  if (score >= 3) return "хорошая";
  if (score >= -2) return "нейтральная";
  if (score >= -7) return "плохая";
  return "опасная";
}
async function loadRepLabel(u) {
  try {
    let r = await api("/reputation/" + u);
    let el = document.getElementById("rep_" + u);
    if (el) el.textContent = repStatus(r.score) + " (" + r.score + ")";
  } catch {}
}
function repMenu(u, type) {
  let arr = type === "praise" ? repPraise : repReport;
  modal(
    `<h2>${type === "praise" ? "Похвалить" : "Пожаловаться"} @${h(u)}</h2>${arr.map((x, i) => `<label class=fileCard><input type=checkbox value="${h(x)}" class=repReason> ${h(x)}</label>`).join("")}<button class=btn onclick="sendRep('${u}','${type}')">Отправить</button>`,
  );
}
async function sendRep(u, type) {
  let reasons = $$(".repReason:checked").map((x) => x.value);
  if (!reasons.length) return toast("Выбери причину");
  try {
    await api("/reputation/" + u, {
      method: "POST",
      body: JSON.stringify({ type, reasons }),
    });
    toast("Репутация обновлена");
    closeModal();
  } catch (e) {
    toast(e.message);
  }
}
async function viewRep(u) {
  try {
    let r = await api("/reputation/" + u);
    modal(
      `<h2>Репутация @${h(u)}</h2><div class=fileCard>Статус: <b>${repStatus(r.score)}</b> · баллы: ${r.score}</div>` +
        (r.items || [])
          .map(
            (x) =>
              `<div class=fileCard>${x.type === "praise" ? "✅" : "⚠️"} <b>${h(x.from)}</b><br>${(x.reasons || []).map(h).join(", ")}<br><span class=small>${date(x.createdAt)} ${time(x.createdAt)}</span></div>`,
          )
          .join("") || "<p class=muted>Записей нет</p>",
    );
  } catch (e) {
    toast(e.message);
  }
}

function modal(x, opts = {}) {
  const locked = !!opts.lock;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modalWrap ${locked ? "modalLocked" : ""}" ${locked ? "" : 'onclick="closeModal()"'}><div class=modal onclick="event.stopPropagation()">${x}</div></div>`,
  );
  $$(".modal [id^=rep_]").forEach((el) =>
    loadRepLabel(el.id.replace("rep_", "")),
  );
  window.NVActionBridge?.bind(document.body);
}
function closeModal() {
  $(".modalWrap")?.remove();
}
function ctx(e, id) {
  e.preventDefault();
  document.querySelector(".ctx")?.remove();
  let mine = findMsg(id)?.from === S.user.username;
  let d = document.createElement("div");
  d.className = "ctx ctxRich";
  d.style.left = Math.min(e.clientX, window.innerWidth - 260) + "px";
  d.style.top = Math.min(e.clientY, window.innerHeight - 360) + "px";
  const quick = reactionList
    .map((emoji) => `<button class="reactQuick" onclick="react('${id}','${inlineArg(emoji)}')">${h(emoji)}</button>`)
    .join("");
  d.innerHTML = `<div class=ctxTitle>Реакция</div><div class=ctxReactions>${quick}</div><button onclick="S.replyTo='${id}';document.querySelector('.ctx').remove();render()">Ответить</button><button onclick="toggleSelect('${id}');document.querySelector('.ctx').remove();renderMessagesOnly(false)">Выделить</button>${mine ? `<button onclick="startEdit('${id}')">Редактировать</button><button onclick="delMsg('${id}',1)">Удалить у всех</button>` : ""}<button onclick="pinMsg('${id}')">Закрепить</button><button onclick="delMsg('${id}',0)">Удалить у себя</button>`;
  document.body.appendChild(d);
  window.NVActionBridge?.bind(d);
}

function showChatMenu(e) {
  e.preventDefault();
  document.querySelector(".ctx")?.remove();
  let d = document.createElement("div");
  d.className = "ctx";
  d.style.left = e.clientX + "px";
  d.style.top = e.clientY + "px";
  d.innerHTML = `<button onclick="S.searchInChat=true;document.querySelector('.ctx').remove();render()">Поиск</button><button onclick="togglePinnedChat('${S.active}')">Закрепить чат</button><button onclick="toggleArchiveChat('${S.active}')">Архив</button><button onclick="muteChat()">Уведомления</button><button onclick="exportActiveChat()">Экспорт чата</button><button onclick="groupSettings()">Настройки группы</button><button onclick="deleteChat()">Удалить чат</button><button onclick="blockActiveContact()">Заблокировать контакт</button>`;
  document.body.appendChild(d);
}
async function react(id, encodedEmoji) {
  try {
    const emoji = decodeURIComponent(String(encodedEmoji || ""));
    const response = await api("/messages/" + id + "/react", {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
    replaceMsg(response.message);
    renderMessagesOnly(false);
  } catch (error) {
    toast(error.message || error);
  }
  document.querySelector(".ctx")?.remove();
}
function startEdit(id) {
  S.editId = id;
  document.querySelector(".ctx")?.remove();
  render();
}
function cancelEdit() {
  S.editId = null;
  render();
}
async function editMsgSave(id, text) {
  try {
    const message = findMsg(id);
    const payload = await buildOutgoingMessagePayload(message?.chatId || S.active, text, message?.decryptedAttachment || message?.attachment || null);
    let r = await api("/messages/" + id, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await decryptMessage(r.message);
    replaceMsg(r.message);
    S.editId = null;
    toast("Сообщение изменено");
    render();
  } catch (e) {
    toast("Не изменено: " + e.message);
  }
}
async function pinMsg(id) {
  try {
    await api("/messages/" + id + "/pin", { method: "POST", body: "{}" });
    await loadChats(false);
    render();
  } catch (e) {
    toast(e.message);
  }
  document.querySelector(".ctx")?.remove();
}
async function delMsg(id, all) {
  try {
    await api("/messages/" + id + "?all=" + all, { method: "DELETE" });
    for (const k in S.messages)
      S.messages[k] = S.messages[k].filter((m) => m.id !== id);
    S.selected.delete(id);
    renderMessagesOnly(false);
  } catch (e) {
    toast(e.message);
  }
  document.querySelector(".ctx")?.remove();
}
function toggleSelect(id) {
  S.selected.has(id) ? S.selected.delete(id) : S.selected.add(id);
  render();
}
function clearSelection() {
  S.selected.clear();
  render();
}
async function deleteSelected(all) {
  let ids = [...S.selected];
  for (const id of ids) {
    try {
      await api("/messages/" + id + "?all=" + all, { method: "DELETE" });
      for (const k in S.messages)
        S.messages[k] = S.messages[k].filter((m) => m.id !== id);
    } catch (e) {
      toast(e.message);
    }
  }
  S.selected.clear();
  await loadChats(false);
  render();
}
async function muteChat() {
  let c = currentChat();
  if (!c) return;
  modal(
    `<h2>Уведомления чата</h2><label class=fileCard><input id=mutedToggle type=checkbox ${c.muted?.[S.user.username] ? "checked" : ""}> Отключить уведомления для этого чата</label><button class=btn onclick="saveChatNotify()">Сохранить</button>`,
  );
}
async function saveChatNotify() {
  try {
    let muted = !!$("#mutedToggle")?.checked;
    await api("/chats/" + S.active + "/mute", {
      method: "POST",
      body: JSON.stringify({ muted }),
    });
    await loadChats(false);
    toast("Настройка уведомлений сохранена");
    closeModal();
    render();
  } catch (e) {
    toast(e.message);
  }
}
async function blockUser(u) {
  await api("/block/" + u, { method: "POST", body: "{}" });
  toast("Пользователь заблокирован");
  closeModal();
}

const emojiGroups = {
  "Частые": ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😴", "😭", "😡"],
  "Реакции": reactionList,
  "Жесты": ["👋", "👌", "👏", "🙌", "🤝", "🙏", "💪", "🤘", "✌️", "🫶", "👀", "🧠"],
  "Символы": ["❤️", "🖤", "💙", "💜", "💛", "💚", "✨", "🔥", "⚡", "💯", "✅", "❌", "⭐", "🌙"],
  "NightVault": ["🔒", "🔐", "🛡️", "🗝️", "🌑", "🌘", "🩸", "💀", "👻", "🕶️", "📎", "🚀"],
};
const emojiList = Object.values(emojiGroups).flat();
function toggleEmojiPicker() {
  let old = document.querySelector(".emojiPanel");
  if (old) {
    old.remove();
    return;
  }
  let box = document.createElement("div");
  box.className = "emojiPanel emojiPanelRich";
  box.innerHTML = Object.entries(emojiGroups)
    .map(
      ([title, items]) =>
        `<section><b>${h(title)}</b><div>${items
          .map((e) => `<button onclick="insertEmoji('${e}')">${e}</button>`)
          .join("")}</div></section>`,
    )
    .join("");
  document.body.appendChild(box);
  window.NVActionBridge?.bind(box);
  let b =
    document.querySelector('.composer button[title="Эмодзи"]') ||
    document.querySelector(".composer .iconBtn:nth-child(2)");
  let r = b?.getBoundingClientRect();
  if (r) {
    box.style.left = Math.min(r.left, window.innerWidth - 360) + "px";
    box.style.bottom = window.innerHeight - r.top + 8 + "px";
  }
}

function insertEmoji(e) {
  let t = $("#txt");
  if (!t) return;
  let a = t.selectionStart || 0,
    b = t.selectionEnd || a;
  t.value = t.value.slice(0, a) + e + t.value.slice(b);
  t.focus();
  t.selectionStart = t.selectionEnd = a + e.length;
  saveDraft();
  document.querySelector(".emojiPanel")?.remove();
}
async function groupSettings() {
  document.querySelector(".ctx")?.remove();
  const chat = currentChat();
  if (!chat || !["group", "channel"].includes(chat.type))
    return toast("Это не группа");
  const isAdmin = chat.admins?.includes(S.user.username);
  const isOwner = chat.owner === S.user.username;
  const members = (chat.members || [])
    .map((username) => {
      const badges = [
        username === chat.owner ? "владелец" : "",
        chat.admins?.includes(username) && username !== chat.owner
          ? "админ"
          : "",
      ]
        .filter(Boolean)
        .join(", ");
      const actions =
        username === S.user.username
          ? ""
          : `${isAdmin && username !== chat.owner ? `<button class='btn danger' onclick="removeGroupMember('${username}')">Удалить</button>` : ""}${isOwner ? `<button class='btn ghost' onclick="transferGroupOwner('${username}')">Передать права</button>` : ""}`;
      return `<div class=fileCard><span>👤 @${h(username)}${badges ? `<small>${h(badges)}</small>` : ""}</span>${actions}</div>`;
    })
    .join("");
  modal(
    `<h2>Настройки ${chat.type === "channel" ? "канала" : "группы"}</h2><input id=gsTitle class=field value="${h(chat.title || "")}"><textarea id=gsDesc class=field placeholder="Описание">${h(chat.description || "")}</textarea><label class=fileCard><input id=gsWrite type=checkbox ${chat.permissions?.write !== false ? "checked" : ""} ${chat.type === "channel" ? "disabled" : ""}> Участники могут писать</label><label class=fileCard><input id=gsInvite type=checkbox ${chat.permissions?.invite !== false ? "checked" : ""}> Участники могут приглашать</label><label class=fileCard><input id=gsAvatar type=checkbox ${chat.permissions?.avatar ? "checked" : ""}> Участники могут менять аватар/описание</label><h3>Добавить участников</h3><input id=gsAddMembers class=field placeholder="user1, user2"><h3>Участники</h3>${members}<button class=btn onclick="saveGroupSettings()">Сохранить</button><button class='btn danger' onclick="leaveGroup()">Покинуть ${chat.type === "channel" ? "канал" : "группу"}</button>`,
  );
}
async function saveGroupSettings() {
  try {
    const additions = String($("#gsAddMembers")?.value || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const permissions = {
      write: Boolean($("#gsWrite")?.checked),
      invite: Boolean($("#gsInvite")?.checked),
      avatar: Boolean($("#gsAvatar")?.checked),
    };
    await api("/chats/" + S.active, {
      method: "PUT",
      body: JSON.stringify({
        title: $("#gsTitle")?.value,
        description: $("#gsDesc")?.value,
        permissions,
        addMembers: additions,
      }),
    });
    closeModal();
    await loadChats(false);
    render();
  } catch (error) {
    toast(error.message || error);
  }
}
async function removeGroupMember(username) {
  if (!confirm(`Удалить @${username} из группы?`)) return;
  try {
    await api(`/chats/${S.active}/members/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
    await loadChats(false);
    closeModal();
    await groupSettings();
  } catch (error) {
    toast(error.message || error);
  }
}
async function transferGroupOwner(username) {
  if (!confirm(`Передать права владельца @${username}?`)) return;
  try {
    await api(`/chats/${S.active}/owner`, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    await loadChats(false);
    closeModal();
    await groupSettings();
  } catch (error) {
    toast(error.message || error);
  }
}
async function leaveGroup() {
  const chat = currentChat();
  if (!chat || !confirm(`Покинуть «${chat.title}»?`)) return;
  try {
    await api(`/chats/${chat.id}/leave`, { method: "POST", body: "{}" });
    S.active = null;
    closeModal();
    await loadChats(false);
    render();
  } catch (error) {
    toast(error.message || error);
  }
}
async function deleteChat() {
  document.querySelector(".ctx")?.remove();
  if (!S.active) return;
  let c = currentChat();
  if (c?.type === "saved") return toast("Избранное удалить нельзя");
  if (!confirm("Удалить чат из списка?")) return;
  try {
    await api("/chats/" + S.active + "/delete", { method: "POST", body: "{}" });
    S.active = null;
    await loadChats(false);
    render();
  } catch (e) {
    toast("Чат не удалён: " + e.message);
  }
}
async function blockActiveContact() {
  let c = currentChat();
  document.querySelector(".ctx")?.remove();
  if (!c || c.type !== "private")
    return toast("Блокировка доступна только в личном чате");
  await blockUser(c.other.username);
}
async function devices() {
  try {
    const response = await api("/devices");
    modal(
      "<h2>Устройства и сессии</h2>" +
        (response.devices || [])
          .map(
            (device) =>
              `<div class=fileCard>💻 <span>${h(device.device)}${device.current ? " · текущее" : ""}<br><small>${h(device.ip || "IP неизвестен")} · последняя активность ${date(device.lastUsedAt)} ${time(device.lastUsedAt)} · истекает ${date(device.expiresAt)}</small></span>${device.current ? "" : `<button class='btn danger' onclick="logoutDevice('${device.id}')">Завершить</button>`}</div>`,
          )
          .join("") || "<div class=muted>Активных сессий нет</div>",
    );
  } catch (error) {
    toast("Сессии не загружены: " + error.message);
  }
}
async function logoutDevice(id) {
  try {
    await api("/devices/" + encodeURIComponent(id), { method: "DELETE" });
    toast("Сессия завершена");
    await devices();
  } catch (error) {
    toast(error.message || error);
  }
}
async function logoutAll() {
  await api("/devices/logout-all", { method: "POST", body: "{}" });
  toast("Другие сессии закрыты");
}
async function logout() {
  try {
    await api("/logout", { method: "POST", body: "{}" });
  } catch {}
  try {
    sock?.close();
  } catch {}
  clearBlobUrls();
  await nvBridge.authClearCurrent();
  const accounts = (await nvBridge.authList()) || [];
  S = defaultState();
  S.accounts = accounts;
  renderAuth();
}
function isPinnedChat(id) {
  return JSON.parse(localStorage.nvPinnedChats || "[]").includes(id);
}
function isArchived(id) {
  return JSON.parse(localStorage.nvArchivedChats || "[]").includes(id);
}
function saveSet(key, id, on) {
  let a = JSON.parse(localStorage[key] || "[]");
  a = a.filter((x) => x !== id);
  if (on) a.push(id);
  localStorage[key] = JSON.stringify(a);
}
function togglePinnedChat(id) {
  saveSet("nvPinnedChats", id, !isPinnedChat(id));
  toast(isPinnedChat(id) ? "Чат закреплён" : "Чат откреплён");
  render();
}
function toggleArchiveChat(id) {
  saveSet("nvArchivedChats", id, !isArchived(id));
  toast(isArchived(id) ? "Чат в архиве" : "Чат возвращён из архива");
  render();
}
function getDraft(id) {
  return id ? localStorage["nvDraft_" + id] || "" : "";
}
function setDraft(id, v) {
  if (!id) return;
  if (v) localStorage["nvDraft_" + id] = v;
  else localStorage.removeItem("nvDraft_" + id);
}
function saveDraft() {
  try {
    if (S.active) setDraft(S.active, $("#txt")?.value || "");
  } catch {}
}
function authorFor(m) {
  if (!m) return { username: "?", displayName: "?" };
  if (m.from === S.user?.username) return S.user;
  const c = currentChat();
  if (c?.other && c.other.username === m.from) return c.other;
  return { username: m.from, displayName: m.from, avatar: "" };
}
function visibleMessages(id) {
  let arr = [...(S.messages[id] || [])];
  if (S.dateFilter)
    arr = arr.filter(
      (m) => new Date(m.createdAt).toISOString().slice(0, 10) === S.dateFilter,
    );
  let q = (S.chatSearch || "").toLowerCase().slice(0, 64);
  if (q)
    arr = arr.filter(
      (m) =>
        (m.decryptedText || m.text || "").toLowerCase().includes(q) ||
        (m.decryptedAttachment?.name || m.attachment?.name || "").toLowerCase().includes(q),
    );
  let f = S.mediaFilter || "all";
  if (f !== "all")
    arr = arr.filter((m) => {
      let a = m.decryptedAttachment || m.attachment,
        t = a?.type || "";
      if (f === "photo") return t.startsWith("image/");
      if (f === "video") return t.startsWith("video/");
      if (f === "audio") return t.startsWith("audio/");
      if (f === "document")
        return (
          a &&
          !t.startsWith("image/") &&
          !t.startsWith("video/") &&
          !t.startsWith("audio/")
        );
      if (f === "link") return /(https?:\/\/|www\.)/i.test(m.text || "");
      return true;
    });
  const limit = Math.max(80, Math.min(700, Number(S.virtualWindow || 220)));
  return window.NV130RenderChat?.windowMessages ? window.NV130RenderChat.windowMessages(arr, limit) : arr.slice(-limit);
}
async function loadAudioDevices() {
  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    S.audioDevices = devices.filter((d) => d.kind === "audioinput");
  } catch {
    S.audioDevices = [];
  }
}
async function testMicList() {
  try {
    let s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    await withTimeout(loadAudioDevices(), 1200);
    toast("Микрофоны обновлены");
    render();
  } catch (e) {
    toast("Нет доступа к микрофону: " + e.message);
  }
}
async function startVoice() {
  if (S.recording) return;
  if (!S.active) return toast("Сначала открой чат");
  try {
    let audio = S.micId ? { deviceId: { exact: S.micId } } : true;
    let stream = await navigator.mediaDevices.getUserMedia({ audio });
    let mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    let media = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined,
    );
    let chunks = [],
      started = Date.now(),
      done = false;
    media.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    media.onstop = async () => {
      if (done) return;
      done = true;
      try {
        recCleanup(stream);
        if (!chunks.length)
          return toast("Голосовое не записалось: пустой файл");
        let type = mime || chunks[0].type || "audio/webm";
        let blob = new Blob(chunks, { type });
        if (blob.size < 300) return toast("Голосовое слишком короткое");
        const dur = Math.max(1, Math.round((Date.now() - started) / 1000));
        const voiceFile = new File([blob], "voice-" + Date.now() + ".webm", {
          type,
        });
        const uploaded = await uploadBrowserFile(voiceFile);
        uploaded.voice = true;
        uploaded.duration = dur;
        await sendMsg(uploaded);
      } catch (e) {
        toast("Голосовое не отправлено: " + (e.message || e));
      }
    };
    media.start(250);
    S.recording = { media, stream, started };
    voiceTimer = setInterval(updateVoiceUI, 120);
    updateVoiceUI();
  } catch (e) {
    toast("Нет доступа к микрофону: " + (e.message || e));
  }
}
function recCleanup(stream) {
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {}
}
function stopVoice(send = true) {
  if (!S.recording) return;
  let rec = S.recording;
  clearInterval(voiceTimer);
  voiceTimer = null;
  S.recording = null;
  updateVoiceUI();
  try {
    if (!send) {
      rec.media.onstop = null;
      recCleanup(rec.stream);
      rec.media.stop();
      return;
    }
    rec.media.requestData?.();
    setTimeout(() => {
      try {
        if (rec.media.state !== "inactive") rec.media.stop();
      } catch {}
    }, 60);
  } catch (e) {
    recCleanup(rec.stream);
    toast("Ошибка записи: " + (e.message || e));
  }
}
async function toggleVoice() {
  if (S.recording) stopVoice(true);
  else startVoice();
}
function updateVoiceUI() {
  let b = $("#recBtn"),
    v = $("#voiceState");
  if (!b) return;
  if (S.recording) {
    b.textContent = "●";
    b.classList.add("recording");
    if (v)
      v.innerHTML =
        "<span class=recDot></span> " +
        Math.round((Date.now() - S.recording.started) / 1000) +
        " сек";
  } else {
    b.textContent = "🎙";
    b.classList.remove("recording");
    if (v) v.textContent = "";
  }
}

async function dropFiles(e) {
  e.preventDefault();
  try {
    if (!S.active) return toast("Сначала открой чат");
    let files = [...e.dataTransfer.files];
    if (!files.length) return;
    toast("Загрузка файлов: " + files.length);
    for (const f of files) {
      let r = await uploadBrowserFile(f);
      await sendMsg(r);
    }
  } catch (err) {
    toast("Файл не отправлен: " + (err.message || err));
  }
}
function lockPage() {
  return `<div class=lockScreen><div class=authBox><h1>NightVault locked</h1><input id=unlockPin class=field type=password autocomplete=current-password placeholder="Локальный PIN или пароль"><button class=btn onclick="unlockApp()">Разблокировать</button></div></div>`;
}
function fakePage() {
  return `<div class=fakeNote><h2>Untitled - Notepad</h2><textarea>Заметки...</textarea><button onclick="S.fake=false;S.locked=true;render()">Закрыть заметки</button></div>`;
}
function lockApp() {
  if (!hasLocalLock())
    return toast("Сначала задайте локальный PIN/пароль в настройках.");
  S.locked = true;
  render();
}
async function unlockApp() {
  const value = $("#unlockPin")?.value || "";
  if (await verifyLocalLock(value)) {
    S.locked = false;
    lastActivity = Date.now();
    render();
  } else {
    toast("Неверный локальный PIN/пароль");
  }
}
function touchActivity() {
  lastActivity = Date.now();
}
setInterval(() => {
  let m = Number(localStorage.nvAutoLock || 0);
  if (S.user && m > 0 && !S.locked && Date.now() - lastActivity > m * 60000)
    lockApp();
}, 30000);
["mousemove", "keydown", "click"].forEach((e) =>
  window.addEventListener(e, touchActivity),
);
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "x") {
    S.fake = true;
    S.locked = true;
    try {
      nvBridge.minimize();
    } catch {}
    render();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "h") {
    e.preventDefault();
    openHiddenFolder();
  }
});
async function exportBackup() {
  const password = prompt(
    "Задайте пароль резервной копии (минимум 10 символов):",
  );
  if (!password) return;
  if (password.length < 10)
    return toast("Пароль backup должен содержать минимум 10 символов.");
  try {
    const payload = {
      format: "nightvault-backup-data",
      version: 2,
      user: S.user,
      chats: S.chats,
      messages: S.messages,
      settings: S.settings,
      createdAt: Date.now(),
    };
    if (window.NVBackup?.encryptPayload && window.NVBackup?.downloadEnvelope) {
      const envelope = await window.NVBackup.encryptPayload(payload, password);
      window.NVBackup.downloadEnvelope(envelope, "nightvault-backup");
    } else {
      await encryptedDownload(payload, "nightvault-backup");
    }
    toast("Backup v2 зашифрован AES-GCM, снабжён checksum и экспортирован.");
  } catch (error) {
    toast("Backup не создан: " + (error.message || error));
  }
}


async function decryptBackupEnvelope(envelope, password) {
  if (window.NVBackup?.decryptEnvelope) return window.NVBackup.decryptEnvelope(envelope, password);
  if (envelope?.format !== "nightvault-backup") throw new Error("Неверный формат backup.");
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: envelope.kdf?.hash || "SHA-256",
      salt: base64ToBytes(envelope.kdf?.salt),
      iterations: Number(envelope.kdf?.iterations || 250000),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.cipher?.iv) },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function encryptedDownload(payload, filenamePrefix) {
  const password = prompt("Задайте пароль архива (минимум 10 символов):");
  if (!password) return;
  if (password.length < 10) return toast("Пароль должен содержать минимум 10 символов.");
  if (window.NVBackup?.encryptPayload && window.NVBackup?.downloadEnvelope) {
    const envelope = await window.NVBackup.encryptPayload(payload, password);
    window.NVBackup.downloadEnvelope(envelope, filenamePrefix);
    return;
  }
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 250000;
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw));
  const envelope = {
    format: "nightvault-backup",
    version: 1,
    createdAt: Date.now(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: bytesToBase64(salt) },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(encrypted),
  };
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.nvb`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function exportActiveChat() {
  const chat = currentChat();
  if (!chat) return toast("Сначала открой чат для экспорта.");
  try {
    let payload = null;
    try {
      const response = await api("/chats/" + encodeURIComponent(chat.id) + "/export");
      payload = response.export;
    } catch {
      payload = {
        format: "nightvault-chat-export",
        version: 1,
        user: S.user?.username,
        chat,
        messages: S.messages[chat.id] || [],
        exportedAt: Date.now(),
      };
    }
    await encryptedDownload(payload, `nightvault-chat-${chat.id}`);
    toast("Экспорт выбранного чата создан.");
  } catch (error) {
    toast("Экспорт чата не создан: " + (error.message || error));
  }
}

async function importBackup() {
  try {
    const [file] = await pickDomFiles({ accept: ".nvb,application/json", multiple: false });
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast("Backup слишком большой для импорта в клиенте.");
    const password = prompt("Пароль backup:");
    if (!password) return;
    const envelope = JSON.parse(await file.text());
    const payload = await decryptBackupEnvelope(envelope, password);
    if (payload.format === "nightvault-backup-data") {
      S.chats = Array.isArray(payload.chats) ? payload.chats : S.chats;
      S.messages = payload.messages && typeof payload.messages === "object" ? payload.messages : S.messages;
      S.settings = payload.settings || S.settings;
      toast("Backup восстановлен в локальный кэш клиента. Серверные данные не перезаписаны.");
      await hydrateAssets([...S.chats, ...Object.values(S.messages).flat()]);
      render();
      return;
    }
    if (payload.format === "nightvault-chat-export") {
      if (payload.chat?.id) {
        S.chats = [payload.chat, ...S.chats.filter((chat) => chat.id !== payload.chat.id)];
        S.messages[payload.chat.id] = Array.isArray(payload.messages) ? payload.messages : [];
        S.active = payload.chat.id;
        toast("Экспорт чата импортирован в локальный просмотр.");
        render();
        return;
      }
    }
    toast("Backup расшифрован, но формат данных не поддержан.");
  } catch (error) {
    toast("Backup не импортирован: " + (error.message || error));
  }
}

async function loadSecurityEvents() {
  try {
    const response = await api("/security-events?limit=80");
    const rows = (response.events || []).map(
      (event) => `<div class=fileCard>🛡️ <span><b>${h(event.type)}</b><br><small>${date(event.createdAt)} ${time(event.createdAt)} · ${h(event.severity)} · ${h(event.message)}</small></span></div>`,
    ).join("") || "<div class=empty>Журнал пока пуст.</div>";
    modal(`<h2>Журнал безопасности</h2>${rows}`);
  } catch (error) {
    toast("Журнал безопасности недоступен: " + (error.message || error));
  }
}

window.addEventListener("click", (e) => {
  if (!e.target.closest(".ctx")) document.querySelector(".ctx")?.remove();
});
try {
  nvBridge.onWindowState?.((data) => {
    S.fullscreen = !!data.fullscreen;
    if (S.user) stableRender({ keepMessages: true });
  });
} catch {}
window.addEventListener("error", (e) =>
  toast("Ошибка интерфейса: " + (e.message || "unknown")),
);


/* NightVault 1.3.9 — feature overlay and guarded UX */
const NV120 = {
  version: "1.3.0",
  noteKey: () => "nvNotesList_" + (S.user?.username || "guest"),
  linkKey: () => "nvLinksList_" + (S.user?.username || "guest"),
  testerOnboardingKey: () => "nvOnboardingSeen_" + (S.user?.username || "guest"),
};
function nv120ReadList(key, fallback = []) {
  try { const value = JSON.parse(localStorage[key] || "[]"); return Array.isArray(value) ? value : fallback; } catch { return fallback; }
}
function nv120WriteList(key, list) {
  try { localStorage[key] = JSON.stringify((Array.isArray(list) ? list : []).slice(0, 500)); } catch {}
}
function nv120Uid(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function nv120Short(text, n = 160) {
  text = String(text || "").replace(/\s+/g, " ").trim();
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}
function nv120LoadNotes() { return nv120ReadList(NV120.noteKey()); }
function nv120SaveNotes(list) { nv120WriteList(NV120.noteKey(), list); }
function nv120LoadLinks() { return nv120ReadList(NV120.linkKey()); }
function nv120SaveLinks(list) { nv120WriteList(NV120.linkKey(), list); }
function notesPage() {
  const list = nv120LoadNotes().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(b.updatedAt||0)-(a.updatedAt||0));
  const q = String(localStorage.nvNotesQuery || "").toLowerCase();
  const filtered = q ? list.filter(n => (n.title + " " + n.body).toLowerCase().includes(q)) : list;
  return `<div class="sidePad nv120Page"><div class="nv120Hero"><div><h1>📝 Заметки</h1><p class=muted>E2EE-ready личные заметки: CRUD, закрепление, поиск, экспорт и offline-first хранение. Серверные endpoints /api/notes включены для sync-слоя.</p></div><button class=btn onclick="nv120EditNote('')">Новая заметка</button></div><div class="nv120Toolbar"><input id=notesSearch class=field placeholder="Поиск по заметкам" value="${h(localStorage.nvNotesQuery || "")}"><button class="btn ghost" onclick="nv120ExportNotes()">Экспорт</button><button class="btn ghost" onclick="nv120ImportNotes()">Импорт</button></div><div class="nv120Grid">${filtered.map(n=>`<article class="nv120Card ${n.pinned?'pinned':''}"><div class=nv120CardHead><b>${h(n.title||'Без названия')}</b><span>${n.pinned?'📌':''}</span></div><p>${h(nv120Short(n.body,220))}</p><small>${date(n.updatedAt||n.createdAt)} ${time(n.updatedAt||n.createdAt)} · ${h(n.syncState||'local')}</small><div class=buttonRow><button class="btn ghost" onclick="nv120EditNote('${n.id}')">Открыть</button><button class="btn ghost" onclick="nv120ToggleNote('${n.id}')">${n.pinned?'Открепить':'Закрепить'}</button><button class="btn danger" onclick="nv120DeleteNote('${n.id}')">Удалить</button></div></article>`).join('') || '<div class=empty>Заметок пока нет. Создай первую заметку.</div>'}</div></div>`;
}
function nv120EditNote(id) {
  const list = nv120LoadNotes();
  const note = list.find(n => n.id === id) || { id: "", title: "", body: "", pinned: false };
  modal(`<h2>${note.id ? 'Редактировать заметку' : 'Новая заметка'}</h2><input id=noteTitle class=field placeholder="Заголовок" value="${h(note.title)}"><textarea id=noteBody class=field rows=12 placeholder="Текст заметки">${h(note.body)}</textarea><label class=fileCard><input id=notePinned type=checkbox ${note.pinned?'checked':''}> Закрепить</label><button class=btn onclick="nv120SaveNote('${note.id}')">Сохранить</button><button class='btn ghost' onclick='closeModal()'>Отмена</button>`);
}
function nv120SaveNote(id) {
  const nowMs = Date.now();
  const list = nv120LoadNotes();
  const note = list.find(n => n.id === id) || { id: nv120Uid('note'), createdAt: nowMs };
  note.title = String($('#noteTitle')?.value || 'Без названия').slice(0,120);
  note.body = String($('#noteBody')?.value || '').slice(0,20000);
  note.pinned = !!$('#notePinned')?.checked;
  note.updatedAt = nowMs;
  note.syncState = 'queued';
  if (!list.some(n => n.id === note.id)) list.push(note);
  nv120SaveNotes(list);
  api('/notes', { method:'PUT', body: JSON.stringify({ notes: list }) }).catch(()=>{});
  closeModal(); toast('Заметка сохранена'); render();
}
function nv120ToggleNote(id) { const list=nv120LoadNotes(); const n=list.find(x=>x.id===id); if(n){n.pinned=!n.pinned;n.updatedAt=Date.now();n.syncState='queued';nv120SaveNotes(list);render();} }
function nv120DeleteNote(id) { if(!confirm('Удалить заметку?')) return; nv120SaveNotes(nv120LoadNotes().filter(n=>n.id!==id)); api('/notes/'+encodeURIComponent(id),{method:'DELETE'}).catch(()=>{}); render(); }
function saveNotes() { nv120SaveNote(''); }
function nv120ExportNotes() { const blob=new Blob([JSON.stringify({version:1,notes:nv120LoadNotes()},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nightvault-notes.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
async function nv120ImportNotes() { const files=await pickDomFiles({accept:'application/json,.json',multiple:false}); const file=files[0]; if(!file)return; try{const data=JSON.parse(await file.text()); const notes=Array.isArray(data.notes)?data.notes:[]; nv120SaveNotes(notes.slice(0,500)); toast('Заметки импортированы'); render();}catch(e){toast('Импорт не выполнен: '+e.message)} }
function linksPage() {
  const manual = nv120LoadLinks();
  const detected = [];
  for (const message of allMessages()) {
    const found = (message.decryptedText || message.text || "").match(/https?:\/\/\S+|www\.\S+/gi) || [];
    found.forEach((value) => { const url = normalizeExternalLink(value); if (url) detected.push({ id:'msg_'+message.id+'_'+detected.length, url, title:url, source:'message', from:message.from, createdAt:message.createdAt }); });
  }
  const q = String(localStorage.nvLinksQuery || '').toLowerCase();
  const all = [...manual.map(x=>({...x, source:'saved'})), ...detected];
  const uniq = []; const seen = new Set();
  for (const item of all) { if (seen.has(item.url)) continue; seen.add(item.url); uniq.push(item); }
  const filtered = q ? uniq.filter(x => (x.title+' '+x.url+' '+(x.description||'')).toLowerCase().includes(q)) : uniq;
  return `<div class="sidePad nv120Page"><div class=nv120Hero><div><h1>🔗 Ссылки</h1><p class=muted>Ручные ссылки + ссылки из сообщений, поиск, описание и быстрый запуск через безопасный openExternal.</p></div><button class=btn onclick="nv120AddLink()">Добавить ссылку</button></div><div class=nv120Toolbar><input id=linksSearch class=field placeholder="Поиск ссылок" value="${h(localStorage.nvLinksQuery||'')}"><span class=muted>${filtered.length} найдено</span></div><div class=nv120List>${filtered.map(item=>`<div class=fileCard><span>🔗 <b>${h(item.title||item.url)}</b><small>${h(item.description||item.url)} · ${h(item.source==='saved'?'сохранено':'из чата')}</small></span><span class=spacer></span><button class="btn ghost" onclick="openExternalLink('${inlineArg(item.url)}')">Открыть</button>${item.source==='saved'?`<button class="btn danger" onclick="nv120DeleteLink('${item.id}')">Удалить</button>`:''}</div>`).join('') || '<div class=empty>Ссылок пока нет</div>'}</div></div>`;
}
function nv120AddLink() { modal(`<h2>Сохранить ссылку</h2><input id=linkUrl class=field placeholder="https://..."><input id=linkTitle class=field placeholder="Название"><textarea id=linkDesc class=field placeholder="Описание"></textarea><button class=btn onclick="nv120SaveLink()">Сохранить</button>`); }
function nv120SaveLink() { const url=normalizeExternalLink($('#linkUrl')?.value||''); if(!url)return toast('Некорректная ссылка'); const list=nv120LoadLinks(); list.unshift({id:nv120Uid('link'),url,title:String($('#linkTitle')?.value||url).slice(0,160),description:String($('#linkDesc')?.value||'').slice(0,800),createdAt:Date.now(),syncState:'queued'}); nv120SaveLinks(list); api('/links',{method:'PUT',body:JSON.stringify({links:list})}).catch(()=>{}); closeModal(); render(); }
function nv120DeleteLink(id) { nv120SaveLinks(nv120LoadLinks().filter(x=>x.id!==id)); render(); }
function downloadsPage() {
  const q = String(localStorage.nvDownloadsQuery || '').toLowerCase();
  const files = allMessages().filter(m => m.decryptedAttachment || m.attachment).map(m => ({...(m.decryptedAttachment || m.attachment), messageId:m.id, chatId:m.chatId, from:m.from, createdAt:m.createdAt}));
  const filter = localStorage.nvDownloadFilter || 'all';
  const filtered = files.filter(a => {
    const type=String(a.type||'');
    const okType = filter==='all' || (filter==='image'&&type.startsWith('image/')) || (filter==='video'&&type.startsWith('video/')) || (filter==='audio'&&type.startsWith('audio/')) || (filter==='doc'&&!type.startsWith('image/')&&!type.startsWith('video/')&&!type.startsWith('audio/'));
    const okQ = !q || String(a.name||'').toLowerCase().includes(q) || String(a.type||'').toLowerCase().includes(q);
    return okType && okQ;
  });
  return `<div class=sidePad><div class=nv120Hero><div><h1>📁 Файлы</h1><p class=muted>Единый список вложений из чатов с фильтрами, поиском, E2EE-статусом и безопасным открытием.</p></div><button class="btn ghost" onclick="attachFiles()">Отправить файл</button></div><div class=folders><button class="chip ${filter==='all'?'active':''}" onclick="filterDownloadType('all')">Все</button><button class="chip ${filter==='image'?'active':''}" onclick="filterDownloadType('image')">Фото</button><button class="chip ${filter==='video'?'active':''}" onclick="filterDownloadType('video')">Видео</button><button class="chip ${filter==='audio'?'active':''}" onclick="filterDownloadType('audio')">Аудио</button><button class="chip ${filter==='doc'?'active':''}" onclick="filterDownloadType('doc')">Документы</button></div><input id=downloadsSearch class=field placeholder="Поиск по файлам" value="${h(localStorage.nvDownloadsQuery||'')}"><div id=downloadList>${renderDownloads(filtered)}</div></div>`;
}
function renderDownloads(files) {
  return (files||[]).map(a=>`<button class=fileCard onclick="downloadAttachment('${attachmentRef(a.url)}','${inlineArg(a.name||'file')}')">📎 <span class=ellipsis>${h(a.name||'file')}</span><small>${h(a.type||'file')} · ${fmt(a.size||0)} · ${a.e2ee?'E2EE':'локально защищено'}</small></button>`).join('') || '<div class=empty>Файлов нет</div>';
}
function settingsPage() {
  return `<div class="sidePad settingsPage"><div class=settingsHeader><div><h1>Настройки 1.3.9</h1><p>Messenger Features Update: внешний вид, чаты, уведомления, безопасность, sync, устройства, данные, сервер, диагностика.</p></div><button class="btn ghost" onclick="saveSettings()">Сохранить всё</button></div><div class=settingsLayout><nav class=settingsMenu>${settingSectionButton("overview", "🌙", "Обзор", "версия, сервер, статус")}${settingSectionButton("appearance", "🎨", "Внешний вид", "темы, акцент, пресеты")}${settingSectionButton("chat", "💬", "Чаты", "фон, шрифт, сообщения")}${settingSectionButton("notifications", "🔔", "Уведомления", "звук, toast, mute")}${settingSectionButton("window", "🪟", "Окно", "трей, размеры")}${settingSectionButton("privacy", "🔐", "Безопасность", "PIN, 2FA, backup")}${settingSectionButton("sync", "🔄", "Синхронизация", "offline queue, push/pull")}${settingSectionButton("devices", "📱", "Устройства", "multi-device, ключи")}${settingSectionButton("data", "🗄", "Данные", "backup, reset, отчёт")}${settingSectionButton("developer", "🧪", "Диагностика", "тесты и crash report")}</nav>${settingsPanel()}</div></div>`;
}
const nv120BaseSettingsPanel = settingsPanel;
settingsPanel = function nv120SettingsPanel() {
  const section = S.settingsSection || 'overview';
  if (section === 'sync') return `<section class=settingsPanel><h2>Синхронизация</h2><p class=muted>Offline-first очередь, push/pull endpoints, индикатор состояния и ручная отправка очереди.</p><div class=settingCards><div class=settingCard><b>Очередь</b><span>${(S.offlineQueue||[]).length}</span><small>неотправленных событий</small></div><div class=settingCard><b>Сервер</b><span>${h(getServerHttp())}</span><small>${sock?'WebSocket активен':'WebSocket переподключается'}</small></div><div class=settingCard><b>E2EE</b><span>${S.e2ee?.enabled?'включено':'выключено'}</span><small>шифрование сообщений и файлов</small></div></div><div class=buttonRow><button class=btn onclick="flushOfflineQueue()">Отправить очередь</button><button class="btn ghost" onclick="manualSyncPull()">Pull sync</button><button class="btn ghost" onclick="manualSyncPush()">Push sync</button><button class="btn ghost" onclick="loadSyncHistory()">История sync</button></div><div id=syncResult class=testResult></div></section>`;
  if (section === 'devices') return `<section class=settingsPanel><h2>Устройства</h2><p class=muted>Каждое устройство имеет отдельную E2EE identity. Unknown devices подсвечиваются через security events.</p><div class=buttonRow><button class=btn onclick="devices()">Открыть список устройств</button><button class="btn ghost" onclick="nv120ExportRecovery()">Экспорт recovery key</button><button class="btn ghost" onclick="nv120RotateLocalKey()">Сбросить локальный ключ</button></div><div class=securityCard>Device ID: <code>${h(S.e2ee?.deviceId||'создаётся')}</code></div></section>`;
  if (section === 'data') return `<section class=settingsPanel><h2>Данные</h2><p class=muted>Локальные данные, backup, экспорт и подготовка отчёта для тестеров.</p><div class=buttonRow><button class="btn ghost" onclick="exportBackup()">Backup AES-GCM</button><button class="btn ghost" onclick="importBackup()">Импорт backup</button><button class="btn ghost" onclick="nv120ExportAllData()">Экспорт локальных данных</button><button class="btn danger" onclick="nv120ResetLocalData()">Сбросить локальные настройки</button></div></section>`;
  if (section === 'developer') return `<section class=settingsPanel><h2>Диагностика тестера</h2><p class=muted>Сбор crash-report без приватных ключей и содержимого сообщений.</p><div class=buttonRow><button class=btn onclick="nv120CollectDebugReport()">Собрать отчёт</button><button class="btn ghost" onclick="checkServerConnection()">Проверить сервер</button><button class="btn ghost" onclick="loadSecurityEvents()">Журнал безопасности</button></div><textarea id=debugReport class=field rows=12 readonly></textarea></section>`;
  return nv120BaseSettingsPanel();
};
async function manualSyncPull() { try { const r=await api('/sync/pull?cursor=0'); $('#syncResult').textContent=JSON.stringify(r,null,2); toast('Pull sync выполнен'); } catch(e){ toast('Sync pull: '+e.message); } }
async function manualSyncPush() { try { const r=await api('/sync/push',{method:'POST',body:JSON.stringify({events:[]})}); $('#syncResult').textContent=JSON.stringify(r,null,2); toast('Push sync выполнен'); } catch(e){ toast('Sync push: '+e.message); } }
function nv120ExportRecovery() { const payload={version:1,deviceId:S.e2ee?.deviceId||'',publicKey:S.e2ee?.publicKey||'',exportedAt:Date.now()}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nightvault-recovery-public.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function nv120RotateLocalKey() { if(!confirm('Сбросить локальный E2EE ключ? Старые сообщения могут не расшифроваться на этом устройстве.'))return; localStorage.removeItem('nvE2eeDeviceId'); Object.keys(localStorage).filter(k=>k.startsWith('nvE2ee_')).forEach(k=>localStorage.removeItem(k)); toast('Ключ будет создан заново после перезапуска.'); }
function nv120CollectDebugReport() { const report={version:RELEASE_LABEL,time:new Date().toISOString(),server:getServerHttp(),user:S.user?.username||'',activeChat:S.active||'',chats:S.chats.length,loadedMessages:allMessages().length,offlineQueue:(S.offlineQueue||[]).length,theme:S.theme,chatBg:S.chatBg,e2eeDevice:S.e2ee?.deviceId||'',lastError:window.__nvLastError||'',localStorageKeys:Object.keys(localStorage).filter(k=>k.startsWith('nv')).length}; const text=JSON.stringify(report,null,2); const out=$('#debugReport'); if(out)out.value=text; const blob=new Blob([text],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nightvault-debug-report-1.3.9.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Отчёт диагностики собран'); }
function nv120ExportAllData(){ const payload={version:1,notes:nv120LoadNotes(),links:nv120LoadLinks(),visual:{theme:S.theme,accent:S.accent,chatBg:S.chatBg,fontSize:S.fontSize},exportedAt:Date.now()}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nightvault-local-data-1.3.9.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function nv120ResetLocalData(){ if(!confirm('Сбросить локальные настройки NightVault? Аккаунт нужно будет открыть заново.'))return; Object.keys(localStorage).filter(k=>k.startsWith('nv')).forEach(k=>localStorage.removeItem(k)); location.reload(); }
function nv120ShowOnboarding() { if(!S.user || localStorage[NV120.testerOnboardingKey()]) return; localStorage[NV120.testerOnboardingKey()]='1'; setTimeout(()=>modal(`<div class=updateHero><div class=updateGlow>1.2</div><h2>NightVault 1.3.9</h2><p>Добавлены Messenger Core, файлы, заметки, ссылки, персонализация, sync, multi-device, диагностика и Server Admin Pro.</p><div class=settingCards><div class=settingCard><b>1</b><small>Сообщения снизу, реакции, ответы, edit/delete</small></div><div class=settingCard><b>2</b><small>E2EE и устройства</small></div><div class=settingCard><b>3</b><small>Crash report для тестеров</small></div></div><button class=btn onclick='closeModal()'>Начать тест</button></div>`),900); }
const nv120BaseRender = render;
render = function nv120Render() { nv120BaseRender(); if (S.user) setTimeout(nv120ShowOnboarding, 80); };
const nv120BaseBind = bind;
bind = function nv120Bind() { nv120BaseBind(); const ns=$('#notesSearch'); if(ns) ns.oninput=(e)=>{localStorage.nvNotesQuery=e.target.value; render();}; const ls=$('#linksSearch'); if(ls) ls.oninput=(e)=>{localStorage.nvLinksQuery=e.target.value; render();}; const ds=$('#downloadsSearch'); if(ds) ds.oninput=(e)=>{localStorage.nvDownloadsQuery=e.target.value; render();}; };
window.addEventListener('keydown',(e)=>{ if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault(); S.searchInChat=true; render();} if(e.ctrlKey&&e.key.toLowerCase()==='n'){e.preventDefault(); switchTab('notes');} if(e.ctrlKey&&e.key.toLowerCase()==='j'){e.preventDefault(); scrollChatBottom(false);} });
window.addEventListener('error',(e)=>{ window.__nvLastError = e.message || String(e.error || e); });
window.addEventListener('unhandledrejection',(e)=>{ window.__nvLastError = e.reason?.message || String(e.reason || e); });

bindUpdaterEvents();
init().catch(showBootError);

/* NightVault 1.3.0 client overlays: Sync Engine 2.0 history, E2EE trust UI helpers, local decrypted search index and diff-safe message window. */
function nv130SyncDeviceId() {
  return S.e2ee?.deviceId || localStorage.nvE2eeDeviceId || "default";
}
function nv130ClientId() {
  if (!localStorage.nvClientId) localStorage.nvClientId = "client_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  return localStorage.nvClientId;
}
async function manualSyncPull() {
  try {
    const username = S.user?.username || "guest";
    const cursor = Number(localStorage[`nvSyncCursor_${username}_${nv130SyncDeviceId()}`] || 0);
    const r = await api(`/sync/pull?cursor=${cursor}&deviceId=${encodeURIComponent(nv130SyncDeviceId())}&limit=200`);
    localStorage[`nvSyncCursor_${username}_${nv130SyncDeviceId()}`] = String(r.nextCursor || r.cursor || cursor);
    window.NV130Sync?.saveHistory(username, { direction: "pull", cursor: r.cursor, events: (r.events || []).length, conflicts: (r.conflicts || []).length });
    const out = $('#syncResult'); if (out) out.textContent = JSON.stringify(r, null, 2);
    toast('Pull sync выполнен: ' + ((r.events || []).length) + ' событий');
  } catch(e){ toast('Sync pull: '+e.message); }
}
async function manualSyncPush() {
  try {
    const events = (S.offlineQueue || []).slice(0, 50).map((item) => window.NV130Sync.event('message', 'create', { text: item.text || '', attachment: item.attachment || null, chatId: item.chatId, replyTo: item.replyTo }, { entityId: item.localId || item.id, version: item.version || 1 }));
    const r = await api('/sync/push',{method:'POST',body:JSON.stringify({items:events, deviceId:nv130SyncDeviceId(), clientId:nv130ClientId()})});
    window.NV130Sync?.saveHistory(S.user?.username || 'guest', { direction: 'push', accepted: (r.accepted || []).length, rejected: (r.rejected || []).length, cursor: r.cursor });
    const out = $('#syncResult'); if (out) out.textContent = JSON.stringify(r, null, 2);
    toast('Push sync выполнен: ' + ((r.accepted || []).length) + ' принято');
  } catch(e){ toast('Sync push: '+e.message); }
}
async function loadSyncHistory() {
  try {
    const r = await api('/sync/history');
    const out = $('#syncResult'); if (out) out.textContent = JSON.stringify(r, null, 2);
    return r;
  } catch (e) { toast('История sync: ' + e.message); return null; }
}
function rebuildLocalDecryptedIndex() {
  const username = S.user?.username || 'guest';
  const rows = [];
  for (const [chatId, messages] of Object.entries(S.messages || {})) {
    for (const m of messages || []) {
      rows.push({ chatId, id: m.id, from: m.from, text: m.decryptedText || m.text || '', attachment: m.decryptedAttachment?.name || m.attachment?.name || '', createdAt: m.createdAt || 0 });
    }
  }
  try { localStorage[window.NV130State?.decryptedIndexKey(username) || `nvDecryptedSearchIndex_${username}`] = JSON.stringify(rows.slice(-5000)); } catch {}
  return rows;
}
function searchLocalDecryptedIndex(query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const username = S.user?.username || 'guest';
  let rows = [];
  try { rows = JSON.parse(localStorage[window.NV130State?.decryptedIndexKey(username) || `nvDecryptedSearchIndex_${username}`] || '[]'); } catch {}
  return rows.filter((row) => String(row.text + ' ' + row.attachment).toLowerCase().includes(q)).slice(0, 100);
}
async function openE2eeTrust(chatId = S.active) {
  if (!chatId) return toast('Открой чат для проверки ключей.');
  try {
    const r = await api(`/chats/${encodeURIComponent(chatId)}/e2ee-trust`);
    const text = 'Safety number:\n' + r.safetyNumber + '\n\n' + (r.devices || []).map((d) => `${d.trusted ? '✅' : '⚠️'} ${d.username}/${d.device}: ${d.fingerprint}`).join('\n');
    alert(text);
  } catch (e) { toast('Проверка ключей: ' + e.message); }
}
async function trustDevice(deviceId, trusted = true) {
  try { await api(`/devices/${encodeURIComponent(deviceId)}/trust`, { method:'POST', body:JSON.stringify({ trusted }) }); toast(trusted ? 'Устройство доверено' : 'Доверие снято'); } catch (e) { toast(e.message); }
}
async function exportE2eeRecovery() {
  try {
    const password = prompt('Пароль для encrypted key bundle');
    if (!password) return;
    const bundle = await window.NV130E2EE.exportEncryptedKeyBundle({ deviceId: S.e2ee?.deviceId, publicKey: S.e2ee?.publicKey, createdAt: Date.now() }, password);
    await api('/e2ee/recovery-key', { method:'POST', body:JSON.stringify({ encryptedBundle: JSON.stringify(bundle) }) });
    downloadText('nightvault-e2ee-recovery-key.json', JSON.stringify(bundle, null, 2));
    toast('Encrypted recovery key создан');
  } catch (e) { toast('Recovery key: ' + e.message); }
}
async function saveNotificationSettings(patch = {}) {
  try { return await api('/notifications/settings', { method:'PUT', body:JSON.stringify(patch) }); } catch (e) { toast('Уведомления: ' + e.message); return null; }
}
async function setPresenceMode(mode = 'online') {
  try { await api('/presence', { method:'PUT', body:JSON.stringify({ mode }) }); toast('Presence: ' + mode); } catch (e) { toast('Presence: ' + e.message); }
}
function downloadText(filename, text) {
  const blob = new Blob([String(text || "")], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}


/* NightVault 1.3.9 — multi-client/session, E2EE resync and two-panel page fixes */
(function nv131FixedLayer(){
  const VERSION = "1.3.9";
  function nv131SafeId(value){ return String(value||"").replace(/[^a-zA-Z0-9_-]/g, "_"); }
  function nv131DetailEmpty(title, text, icon="✨") {
    return `<section class="nv131DetailEmpty"><div class="nv131BigIcon">${icon}</div><h2>${h(title)}</h2><p>${h(text)}</p></section>`;
  }
  function nv131Shell(title, subtitle, actionHtml, leftHtml, detailHtml, klass="") {
    return `<div class="nv131Workspace ${klass}"><aside class="nv131Pane nv131PaneLeft"><div class="nv131PaneHeader"><div><h1>${title}</h1><p>${subtitle}</p></div>${actionHtml||""}</div>${leftHtml}</aside><section class="nv131Pane nv131PaneDetail">${detailHtml}</section></div>`;
  }
  function nv131FileTypeLabel(type="") {
    const t=String(type||"");
    if(t.startsWith("image/")) return "Фото";
    if(t.startsWith("video/")) return "Видео";
    if(t.startsWith("audio/")) return "Аудио";
    return "Документ";
  }
  function nv131SelectedNote(list){ return list.find(x=>x.id===localStorage.nv131SelectedNote) || list[0] || null; }
  notesPage = function nv131NotesPage(){
    const all = nv120LoadNotes().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
    const q = String(localStorage.nvNotesQuery || "").toLowerCase();
    const filtered = all.filter(n => !q || `${n.title||""} ${n.body||""}`.toLowerCase().includes(q));
    const selected = nv131SelectedNote(filtered);
    const left = `<div class="nv131Toolbar"><input id="notesSearch" class="field" placeholder="Поиск по заметкам" value="${h(localStorage.nvNotesQuery||"")}"><div class="buttonRow compact"><button class="btn ghost" onclick="nv120ExportNotes()">Экспорт</button><button class="btn ghost" onclick="nv120ImportNotes()">Импорт</button></div></div><div class="nv131List">${filtered.map(n=>`<button class="nv131Item ${selected&&selected.id===n.id?'active':''}" onclick="localStorage.nv131SelectedNote='${n.id}';render()"><b>${h(n.title||'Без названия')}</b><span>${h(nv120Short(n.body||'',90))}</span><small>${n.pinned?'📌 · ':''}${date(n.updatedAt||n.createdAt)} ${time(n.updatedAt||n.createdAt)} · ${h(n.syncState||'local')}</small></button>`).join("") || `<div class="empty slim">Заметок пока нет</div>`}</div>`;
    const detail = selected ? `<div class="nv131DetailHead"><div><h2>${h(selected.title||'Без названия')}</h2><p>${selected.pinned?'📌 Закреплено · ':''}${date(selected.updatedAt||selected.createdAt)} ${time(selected.updatedAt||selected.createdAt)} · ${h(selected.syncState||'local')}</p></div><div class="buttonRow compact"><button class="btn" onclick="nv120EditNote('${selected.id}')">Открыть</button><button class="btn ghost" onclick="nv120ToggleNote('${selected.id}')">${selected.pinned?'Открепить':'Закрепить'}</button><button class="btn danger" onclick="nv120DeleteNote('${selected.id}')">Удалить</button></div></div><article class="nv131PreviewText">${h(selected.body||'Пустая заметка')}</article>` : nv131DetailEmpty("Выбери заметку", "Справа будет содержимое заметки, действия и sync-статус.", "📝");
    return nv131Shell("📝 Заметки", "Личные E2EE-ready заметки с поиском, закрепами и offline-first хранением.", `<button class="btn" onclick="nv120EditNote('')">Новая</button>`, left, detail, "notes");
  };
  linksPage = function nv131LinksPage(){
    const links = nv120CollectLinks();
    const q = String(localStorage.nvLinksQuery || "").toLowerCase();
    const filtered = links.filter(item => !q || `${item.title||""} ${item.description||""} ${item.url||""}`.toLowerCase().includes(q));
    const selected = filtered.find(x=>x.id===localStorage.nv131SelectedLink) || filtered[0] || null;
    const left = `<div class="nv131Toolbar"><input id="linksSearch" class="field" placeholder="Поиск ссылок" value="${h(localStorage.nvLinksQuery||"")}"><span class="muted">${filtered.length} найдено</span></div><div class="nv131List">${filtered.map(item=>`<button class="nv131Item ${selected&&selected.id===item.id?'active':''}" onclick="localStorage.nv131SelectedLink='${h(item.id)}';render()"><b>🔗 ${h(item.title||item.url)}</b><span>${h(nv120Short(item.description||item.url,90))}</span><small>${h(item.source==='saved'?'сохранено':'из чата')}</small></button>`).join("") || `<div class="empty slim">Ссылок пока нет</div>`}</div>`;
    const detail = selected ? `<div class="nv131DetailHead"><div><h2>${h(selected.title||'Ссылка')}</h2><p>${h(selected.source==='saved'?'Ручная ссылка':'Найдена в сообщениях')}</p></div><div class="buttonRow compact"><button class="btn" onclick="openExternalLink('${inlineArg(selected.url)}')">Открыть</button>${selected.source==='saved'?`<button class="btn danger" onclick="nv120DeleteLink('${selected.id}')">Удалить</button>`:''}</div></div><div class="securityCard"><b>URL</b><br><code>${h(selected.url||'')}</code></div><p class="nv131PreviewText">${h(selected.description||'Описание не добавлено')}</p>` : nv131DetailEmpty("Выбери ссылку", "Справа появится URL, описание и безопасное открытие через openExternal.", "🔗");
    return nv131Shell("🔗 Ссылки", "Ручные ссылки и ссылки из сообщений с поиском и безопасным запуском.", `<button class="btn" onclick="nv120AddLink()">Добавить</button>`, left, detail, "links");
  };
  downloadsPage = function nv131DownloadsPage(){
    const q = String(localStorage.nvDownloadsQuery || '').toLowerCase();
    const files = allMessages().filter(m => m.decryptedAttachment || m.attachment).map(m => ({...(m.decryptedAttachment || m.attachment), messageId:m.id, chatId:m.chatId, from:m.from, createdAt:m.createdAt}));
    const filter = localStorage.nvDownloadFilter || 'all';
    const filtered = files.filter(a => { const type=String(a.type||''); const okType = filter==='all' || (filter==='image'&&type.startsWith('image/')) || (filter==='video'&&type.startsWith('video/')) || (filter==='audio'&&type.startsWith('audio/')) || (filter==='doc'&&!type.startsWith('image/')&&!type.startsWith('video/')&&!type.startsWith('audio/')); const okQ = !q || String(a.name||'').toLowerCase().includes(q) || String(a.type||'').toLowerCase().includes(q); return okType && okQ; });
    const selected = filtered.find(x=>x.messageId===localStorage.nv131SelectedFile) || filtered[0] || null;
    const chips = `<div class="folders compact"><button class="chip ${filter==='all'?'active':''}" onclick="filterDownloadType('all')">Все</button><button class="chip ${filter==='image'?'active':''}" onclick="filterDownloadType('image')">Фото</button><button class="chip ${filter==='video'?'active':''}" onclick="filterDownloadType('video')">Видео</button><button class="chip ${filter==='audio'?'active':''}" onclick="filterDownloadType('audio')">Аудио</button><button class="chip ${filter==='doc'?'active':''}" onclick="filterDownloadType('doc')">Документы</button></div>`;
    const left = `${chips}<input id="downloadsSearch" class="field" placeholder="Поиск по файлам" value="${h(localStorage.nvDownloadsQuery||'')}"><div class="nv131List">${filtered.map(a=>`<button class="nv131Item ${selected&&selected.messageId===a.messageId?'active':''}" onclick="localStorage.nv131SelectedFile='${h(a.messageId)}';render()"><b>📎 ${h(a.name||'file')}</b><span>${h(a.type||'file')} · ${fmt(a.size||0)}</span><small>${h(nv131FileTypeLabel(a.type))} · ${a.e2ee?'E2EE':'локально защищено'}</small></button>`).join('') || '<div class="empty slim">Файлов нет</div>'}</div>`;
    const detail = selected ? `<div class="nv131DetailHead"><div><h2>${h(selected.name||'Файл')}</h2><p>${h(nv131FileTypeLabel(selected.type))} · ${fmt(selected.size||0)} · ${selected.e2ee?'E2EE':'локально защищено'}</p></div><button class="btn" onclick="downloadAttachment('${attachmentRef(selected.url)}','${inlineArg(selected.name||'file')}')">Скачать</button></div><div class="securityCard"><b>Источник</b><br>Чат: <code>${h(selected.chatId||'')}</code><br>Сообщение: <code>${h(selected.messageId||'')}</code><br>Тип: <code>${h(selected.type||'file')}</code></div>${String(selected.type||'').startsWith('image/') ? `<div class="nv131MediaPreview">${attHtml(selected)}</div>` : ''}` : nv131DetailEmpty("Выбери файл", "Справа будет предпросмотр, метаданные и безопасное скачивание.", "📁");
    return nv131Shell("📁 Файлы", "Единый список вложений из чатов с фильтрами, поиском и E2EE-статусом.", `<button class="btn ghost" onclick="attachFiles()">Отправить</button>`, left, detail, "downloads");
  };
  const nv131BaseProfilePage = profilePage;
  profilePage = function nv131ProfilePage(){
    const base = nv131BaseProfilePage();
    const user = S.user || {};
    const detail = `<div class="nv131ProfileSummary"><div class="profileHero" style="${cssImageUrl(assetDisplayUrl(user,'banner'))}">${av(user, 'bigAvatar ' + (user.avatarFrame||''))}</div><h2>${h(user.displayName||user.username||'Профиль')}</h2><p class="muted">@${h(user.username||'')}</p>${securitySummary()}<div class="settingCards"><div class="settingCard"><b>Рамка</b><span>${h(user.avatarFrame||'Без рамки')}</span></div><div class="settingCard"><b>Приватность</b><span>${h(user.privacy?.avatar||'all')}</span><small>аватар/баннер</small></div><div class="settingCard"><b>Presence</b><span>${h(user.privacy?.presenceMode||'online')}</span></div></div></div>`;
    return `<div class="nv131Workspace profile"><aside class="nv131Pane nv131PaneLeft nv131FormPane">${base.replace(/^<div class=sidePad[^>]*>/,'').replace(/<\/div>\s*$/,'')}</aside><section class="nv131Pane nv131PaneDetail">${detail}</section></div>`;
  };
  settingsPage = function nv131SettingsPage(){
    const menu = `${settingSectionButton("overview", "🌙", "Обзор", "версия, сервер, статус")}${settingSectionButton("appearance", "🎨", "Внешний вид", "темы, акцент, пресеты")}${settingSectionButton("chat", "💬", "Чаты", "фон, шрифт, сообщения")}${settingSectionButton("notifications", "🔔", "Уведомления", "звук, toast, mute")}${settingSectionButton("window", "🪟", "Окно", "трей, размеры")}${settingSectionButton("privacy", "🔐", "Безопасность", "PIN, 2FA, backup")}${settingSectionButton("sync", "🔄", "Синхронизация", "offline queue, push/pull")}${settingSectionButton("devices", "📱", "Устройства", "multi-device, ключи")}${settingSectionButton("data", "🗄", "Данные", "backup, reset, отчёт")}${settingSectionButton("developer", "🧪", "Диагностика", "тесты и crash report")}`;
    return `<div class="nv131Workspace settings"><aside class="nv131Pane nv131PaneLeft"><div class="nv131PaneHeader"><div><h1>Настройки<br>${VERSION}</h1><p>Messenger Features Update: внешний вид, чаты, уведомления, безопасность, sync, устройства, данные, сервер, диагностика.</p></div><button class="btn ghost" onclick="saveSettings()">Сохранить</button></div><nav class="settingsMenu nv131SettingsMenu">${menu}</nav></aside><section class="nv131Pane nv131PaneDetail nv131SettingsDetail">${settingsPanel()}</section></div>`;
  };
  const nv131BaseAuthorizedFetch = authorizedFetch;
  authorizedFetch = async function nv131AuthorizedFetch(path, opt = {}, retry = true) {
    const response = await rawApi(path, opt);
    if (response.status === 401 && retry && S.refreshToken) {
      const payload = await response.clone().json().catch(() => ({}));
      const message = String(payload.error || payload.message || "");
      if (payload?.details?.code === "token_expired" || /сессия|session|token/i.test(message)) {
        if (await refreshSession()) return authorizedFetch(path, opt, false);
      }
    }
    return response;
  };
  async function nv131RegisterCurrentDevice(silent=true) {
    if (!S.token || !S.user?.username) return false;
    try {
      const identity = await ensureE2eeIdentity(S.user.username);
      await api('/devices/e2ee/current', { method:'POST', body: JSON.stringify({ e2eeDeviceId: identity.deviceId, e2eePublicKey: identity.publicKey, deviceName: navigator.userAgent + ' · ' + (window.NVRuntimeProfile || 'client') }) });
      S.e2eeDevices = {};
      localStorage[`nv131LastDeviceSync_${S.user.username}`] = String(Date.now());
      if (!silent) toast('Ключи устройства пересинхронизированы. Новые сообщения будут расшифровываться.');
      return true;
    } catch (e) {
      if (!silent) toast('Не удалось пересинхронизировать ключи: ' + e.message);
      return false;
    }
  }
  window.nv131RegisterCurrentDevice = nv131RegisterCurrentDevice;
  const nv131BasePersistSession = persistSession;
  persistSession = async function nv131PersistSession(data) {
    await nv131BasePersistSession(data);
    await nv131RegisterCurrentDevice(true);
  };
  const nv131BaseLoadChatE2eeDevices = loadChatE2eeDevices;
  loadChatE2eeDevices = async function nv131LoadChatE2eeDevices(chatId, force=false) {
    if (force) delete S.e2eeDevices[chatId];
    const cachedAt = Number(S.e2eeDevicesAt?.[chatId] || 0);
    if (!force && S.e2eeDevices[chatId] && Date.now() - cachedAt < 8000) return S.e2eeDevices[chatId];
    const r = await api(`/chats/${encodeURIComponent(chatId)}/e2ee-devices`);
    S.e2eeDevicesAt = S.e2eeDevicesAt || {};
    S.e2eeDevicesAt[chatId] = Date.now();
    S.e2eeDevices[chatId] = r.devices || [];
    return S.e2eeDevices[chatId];
  };
  const nv131BaseDecryptMessage = decryptMessage;
  decryptMessage = async function nv131DecryptMessage(message) {
    const result = await nv131BaseDecryptMessage(message);
    if (result?.decryptError && !result._nv131ResyncTried) {
      result._nv131ResyncTried = true;
      await nv131RegisterCurrentDevice(true);
      if (result.chatId) delete S.e2eeDevices[result.chatId];
      result.decryptHint = 'device_resynced';
    }
    return result;
  };
  const nv131BaseEncryptPayloadForChat = encryptPayloadForChat;
  encryptPayloadForChat = async function nv131EncryptPayloadForChat(chatId, payload) {
    await nv131RegisterCurrentDevice(true);
    await loadChatE2eeDevices(chatId, true).catch(()=>{});
    return nv131BaseEncryptPayloadForChat(chatId, payload);
  };
  function nv131CloseEmojiOnOutside(event) {
    const panel = document.querySelector('.emojiPanel');
    if (!panel) return;
    const btn = event.target?.closest?.('.composer button[title="Эмодзи"]');
    if (!panel.contains(event.target) && !btn) panel.remove();
  }
  toggleEmojiPicker = function nv131ToggleEmojiPicker() {
    const old = document.querySelector('.emojiPanel');
    if (old) { old.remove(); return; }
    const box = document.createElement('div');
    box.className = 'emojiPanel emojiPanelRich nv131EmojiPanel';
    box.innerHTML = `<button class="emojiClose" onclick="document.querySelector('.emojiPanel')?.remove()">×</button>` + Object.entries(emojiGroups).map(([title, items]) => `<section><b>${h(title)}</b><div>${items.map((e)=>`<button onclick="insertEmoji('${e}')">${e}</button>`).join('')}</div></section>`).join('');
    document.body.appendChild(box);
    window.NVActionBridge?.bind(box);
    const b = document.querySelector('.composer button[title="Эмодзи"]');
    const r = b?.getBoundingClientRect();
    if (r) {
      box.style.right = Math.max(14, window.innerWidth - r.right - 8) + 'px';
      box.style.bottom = Math.max(78, window.innerHeight - r.top + 8) + 'px';
    }
    setTimeout(() => document.addEventListener('pointerdown', nv131CloseEmojiOnOutside, { once:true }), 0);
  };
  const nv131BaseRender = render;
  render = function nv131Render() {
    nv131BaseRender();
    document.body.dataset.nvProfile = window.NVRuntimeProfile || '';
  };
})();


/* NightVault 1.3.9 — renderer hotfixes: links collector, file actions, E2EE key vault UX, voice UI, reactions, menus */
(function nv131Fixed2Layer(){
  const HOTFIX_LABEL = "1.3.9";
  window.NV_HOTFIX_LABEL = HOTFIX_LABEL;

  window.nv120CollectLinks = function nv120CollectLinks(){
    const manual = typeof nv120LoadLinks === "function" ? nv120LoadLinks() : [];
    const detected = [];
    for (const message of allMessages()) {
      const raw = message.decryptedText || message.text || "";
      const found = String(raw).match(/https?:\/\/\S+|www\.\S+/gi) || [];
      found.forEach((value, idx) => {
        const url = normalizeExternalLink(value.replace(/[),.;]+$/g, ""));
        if (url) detected.push({ id: "msg_" + message.id + "_" + idx, url, title: url, description: "", source: "message", from: message.from, createdAt: message.createdAt });
      });
    }
    const all = [...manual.map((item) => ({ ...item, source: item.source || "saved" })), ...detected];
    const uniq = [];
    const seen = new Set();
    for (const item of all) {
      const key = String(item.url || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniq.push(item);
    }
    return uniq;
  };

  window.nv131SelectFile = function nv131SelectFile(id){
    localStorage.nv131SelectedFile = String(id || "");
    render();
  };
  window.nv131SelectNote = function nv131SelectNote(id){
    localStorage.nv131SelectedNote = String(id || "");
    render();
  };
  window.nv131SelectLink = function nv131SelectLink(id){
    localStorage.nv131SelectedLink = String(id || "");
    render();
  };

  const baseAttHtml = attHtml;
  window.attHtml = attHtml = function nv131Fixed2AttHtml(a){
    if (!a) return "";
    const type = String(a.type || "");
    const ref = attachmentRef(a.url);
    const url = fileUrl(a.url);
    if (type.startsWith("audio/") && a.voice) {
      const duration = Number(a.duration || 0);
      const mm = Math.floor(duration / 60);
      const ss = String(duration % 60).padStart(2, "0");
      return `<div class="voiceBubble voiceBubblePro" data-ref="${h(ref)}"><button class="voicePlay" onclick="playVoice(event,'${ref}')">▶</button><div class="voiceMeta"><div class="voiceWave">${Array.from({ length: 42 }, (_, i) => `<i style="height:${8 + ((i * 11) % 25)}px"></i>`).join("")}</div><div class="voiceSub"><span>${mm}:${ss}</span><span>${fmt(a.size || 0)}</span></div></div><button class="voiceMiniAction" onclick="downloadAttachment('${ref}','${inlineArg(a.name || 'voice.webm')}')">↘</button></div>`;
    }
    return baseAttHtml(a);
  };

  const basePlayVoice = playVoice;
  window.playVoice = playVoice = async function nv131Fixed2PlayVoice(event, ref){
    event?.stopPropagation?.();
    const button = event?.currentTarget;
    if (!button) return basePlayVoice(event, ref);
    if (button.audio && !button.audio.paused) {
      button.audio.pause();
      button.textContent = "▶";
      button.closest(".voiceBubble")?.classList.remove("playing");
      return;
    }
    const url = await hydrateFile(ref);
    if (!url) return toast("Голосовое недоступно.");
    const audio = new Audio(url);
    audio.preload = "auto";
    button.audio = audio;
    button.textContent = "⏸";
    button.closest(".voiceBubble")?.classList.add("playing");
    audio.onerror = () => { button.textContent = "▶"; button.closest(".voiceBubble")?.classList.remove("playing"); toast("Не удалось открыть голосовое сообщение."); };
    audio.onended = () => { button.textContent = "▶"; button.closest(".voiceBubble")?.classList.remove("playing"); };
    audio.play().catch((error) => { button.textContent = "▶"; button.closest(".voiceBubble")?.classList.remove("playing"); toast("Не удалось проиграть: " + (error.message || error)); });
  };

  window.downloadAttachment = downloadAttachment = async function nv131Fixed2DownloadAttachment(ref, encodedName){
    ref = attachmentRef(ref);
    if (!ref) return toast("Файл не выбран или ссылка устарела.");
    const url = await hydrateFile(ref, { force: false });
    if (!url) return toast("Файл недоступен или у аккаунта нет прав.");
    const anchor = document.createElement("a");
    anchor.href = url;
    const metaName = S.e2eeFiles?.[ref]?.name;
    anchor.download = metaName || decodeURIComponent(encodedName || "file");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  function positionFloatingMenu(node, x, y, padding = 12){
    document.body.appendChild(node);
    window.NVActionBridge?.bind(node);
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const left = Math.max(padding, Math.min(x, window.innerWidth - rect.width - padding));
      const top = Math.max(padding, Math.min(y, window.innerHeight - rect.height - padding));
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.maxHeight = `${Math.max(220, window.innerHeight - top - padding)}px`;
    });
  }

  window.ctx = ctx = function nv131Fixed2Ctx(e, id){
    e.preventDefault();
    e.stopPropagation?.();
    document.querySelector(".ctx")?.remove();
    const message = findMsg(id);
    const mine = message?.from === S.user.username;
    const d = document.createElement("div");
    d.className = "ctx ctxRich ctxSafe";
    const quick = reactionList.map((emoji) => `<button class="reactQuick" onclick="react('${id}','${inlineArg(emoji)}')">${h(emoji)}</button>`).join("");
    d.innerHTML = `<button class="ctxClose" onclick="document.querySelector('.ctx')?.remove()">×</button><div class=ctxTitle>Реакция</div><div class=ctxReactions>${quick}</div><button onclick="S.replyTo='${id}';document.querySelector('.ctx')?.remove();render()">Ответить</button><button onclick="toggleSelect('${id}');document.querySelector('.ctx')?.remove();renderMessagesOnly(false)">Выделить</button>${mine ? `<button onclick="startEdit('${id}')">Редактировать</button><button onclick="delMsg('${id}',1)">Удалить у всех</button>` : ""}<button onclick="pinMsg('${id}')">Закрепить</button><button onclick="delMsg('${id}',0)">Удалить у себя</button>`;
    positionFloatingMenu(d, e.clientX, e.clientY);
  };

  window.showChatMenu = showChatMenu = function nv131Fixed2ShowChatMenu(e){
    e.preventDefault();
    e.stopPropagation?.();
    document.querySelector(".ctx")?.remove();
    const d = document.createElement("div");
    d.className = "ctx ctxSafe";
    d.innerHTML = `<button class="ctxClose" onclick="document.querySelector('.ctx')?.remove()">×</button><button onclick="S.searchInChat=true;document.querySelector('.ctx')?.remove();render()">Поиск</button><button onclick="togglePinnedChat('${S.active}')">Закрепить чат</button><button onclick="toggleArchiveChat('${S.active}')">Архив</button><button onclick="muteChat()">Уведомления</button><button onclick="exportActiveChat()">Экспорт чата</button><button onclick="groupSettings()">Настройки группы</button><button onclick="deleteChat()">Удалить чат</button><button onclick="blockActiveContact()">Заблокировать контакт</button>`;
    positionFloatingMenu(d, e.clientX, e.clientY);
  };

  window.react = react = async function nv131Fixed2React(id, encodedEmoji){
    try {
      const emoji = decodeURIComponent(String(encodedEmoji || ""));
      const existing = findMsg(id);
      if (existing) {
        existing.reactions = existing.reactions || {};
        const users = new Set(existing.reactions[emoji] || []);
        users.add(S.user.username);
        existing.reactions[emoji] = [...users];
        renderMessagesOnly(true);
      }
      const response = await api("/messages/" + id + "/react", { method: "POST", body: JSON.stringify({ emoji }) });
      if (response.message) {
        await decryptMessage(response.message);
        if (existing && response.message.decryptError) {
          response.message.decrypted = existing.decrypted;
          response.message.decryptedText = existing.decryptedText;
          response.message.decryptedAttachment = existing.decryptedAttachment;
          response.message.decryptError = existing.decryptError;
        }
        replaceMsg(response.message);
      }
      renderMessagesOnly(true);
    } catch (error) {
      toast(error.message || error);
    }
    document.querySelector(".ctx")?.remove();
  };

  const baseRenderDownloads = renderDownloads;
  window.renderDownloads = renderDownloads = function nv131Fixed2RenderDownloads(files){
    return (files || []).map((a) => `<button class=fileCard onclick="downloadAttachment('${attachmentRef(a.url)}','${inlineArg(a.name || 'file')}')">📎 <span class=ellipsis>${h(a.name || 'file')}</span><small>${h(a.type || 'file')} · ${fmt(a.size || 0)} · ${a.e2ee ? 'E2EE' : 'локально защищено'}</small></button>`).join('') || '<div class=empty>Файлов нет</div>';
  };

  const baseSettingsPanel = settingsPanel;
  window.settingsPanel = settingsPanel = function nv131Fixed2SettingsPanel(){
    const html = baseSettingsPanel();
    return String(html || "").replace(/<h2>NightVault [^<]+<\/h2>/, `<h2>NightVault ${HOTFIX_LABEL}</h2>`);
  };

  const baseNv131SettingsPage = settingsPage;
  window.settingsPage = settingsPage = function nv131Fixed2SettingsPage(){
    return baseNv131SettingsPage().replace(/<h1>Настройки<br>[^<]+<\/h1>/, `<h1>Настройки<br>${HOTFIX_LABEL}</h1>`).replace(/<button class="btn ghost" onclick="saveSettings\(\)">Сохранить<\/button>/, `<button class="btn ghost saveTopBtn" onclick="saveSettings()">Сохранить</button>`);
  };

  // Повторная попытка расшифровки после загрузки ключей из общего vault.
  async function retryDecryptOpenChat(){
    if (!S.active || !S.messages[S.active]?.length) return;
    const failed = S.messages[S.active].filter((m) => m.e2ee && m.decryptError);
    if (!failed.length) return;
    try {
      await ensureE2eeIdentity(S.user?.username);
      for (const m of failed) {
        m.decryptError = false;
        await decryptMessage(m);
      }
      renderMessagesOnly(true);
    } catch {}
  }
  const baseOpenChat = openChat;
  window.openChat = openChat = async function nv131Fixed2OpenChat(id){
    await baseOpenChat(id);
    setTimeout(retryDecryptOpenChat, 250);
  };

  const baseBind = bind;
  window.bind = bind = function nv131Fixed2Bind(){
    baseBind();
    document.addEventListener("pointerdown", (event) => {
      const ctxNode = document.querySelector(".ctx");
      if (ctxNode && !ctxNode.contains(event.target)) ctxNode.remove();
    }, { once: true, capture: true });
  };
})();


/* NightVault 1.3.9 — tester fixes: voice player, scroll stability, group avatars, media preview, updater/security polish */
(function nv133Layer(){
  const HOTFIX_LABEL = "1.3.9";
  window.NV_HOTFIX_LABEL = HOTFIX_LABEL;
  try { localStorage.nvRightPanel = "1"; } catch {}
  if (typeof S === "object") S.rightPanel = true;

  function nv133UserFor(username) {
    if (!username) return { username: "?", displayName: "?", avatar: "" };
    if (S.user?.username === username) return S.user;
    for (const c of S.chats || []) {
      if (c.other?.username === username) return c.other;
      for (const field of ["membersInfo", "memberUsers", "users", "profiles"]) {
        const values = c[field];
        if (Array.isArray(values)) {
          const found = values.find((u) => u?.username === username);
          if (found) return found;
        } else if (values && typeof values === "object" && values[username]) return values[username];
      }
    }
    for (const group of [S.contacts?.accepted, S.contacts?.incoming, S.contacts?.outgoing]) {
      for (const item of group || []) if (item.user?.username === username) return item.user;
    }
    return { username, displayName: username, avatar: "" };
  }

  window.authorFor = authorFor = function nv133AuthorFor(m) {
    if (!m) return { username: "?", displayName: "?" };
    return nv133UserFor(m.from);
  };

  window.showUserProfile = async function nv133ShowUserProfile(username) {
    username = String(username || "");
    let u = nv133UserFor(username);
    try {
      const r = await api("/user/" + encodeURIComponent(username));
      if (r?.user) u = r.user;
    } catch {}
    modal(`<div class=profileHero>${av(u, "bigAvatar")}</div><h2>${h(u.displayName || username)}</h2><div class=muted>@${h(u.username || username)}</div><p>${h(u.bio || "Нет описания")}</p><div class=fileCard onclick="viewRep('${h(u.username || username)}')">⭐ Репутация: <b id='rep_${h(u.username || username)}'>загрузка...</b></div><button class='btn ghost' onclick="repMenu('${h(u.username || username)}','praise')">Похвалить</button><button class='btn danger' onclick="repMenu('${h(u.username || username)}','report')">Пожаловаться</button><button class=btn onclick="closeModal()">Закрыть</button>`);
  };

  const baseMsgHtml = msgHtml;
  window.msgHtml = msgHtml = function nv133MsgHtml(m) {
    const html = baseMsgHtml(m)
      .replace(/<div class=msgText>🔐 Зашифрованное сообщение<\/div>/g, "")
      .replace(/<div class=msgText>🔒 Зашифрованное сообщение<\/div>/g, "");
    const author = authorFor(m);
    return html.replace(/(<(?:div|img)[^>]*class="?[^>]*msgAvatar[^>]*)(>)/, `$1 onclick="event.stopPropagation();showUserProfile('${h(author.username || m.from)}')" title="Открыть профиль"$2`);
  };

  const baseAttHtml = attHtml;
  window.attHtml = attHtml = function nv133AttHtml(a){
    if (!a) return "";
    const type = String(a.type || "");
    const ref = attachmentRef(a.url);
    const url = fileUrl(a.url);
    if (type.startsWith("audio/") && a.voice) {
      const duration = Math.max(0, Number(a.duration || 0));
      const mm = Math.floor(duration / 60);
      const ss = String(duration % 60).padStart(2, "0");
      const bars = Array.from({ length: 56 }, (_, i) => `<i style="height:${4 + ((i * 13) % 20)}px"></i>`).join("");
      return `<div class="voiceBubble voiceBubbleTelegram" data-ref="${h(ref)}"><button class="voicePlay" onclick="playVoice(event,'${ref}')">▶</button><div class="voiceMain"><div class="voiceWave">${bars}</div><div class="voiceSub"><span>${mm}:${ss}</span><span>${fmt(a.size || 0)}</span><span class="voiceDot">●</span></div></div><button class="voiceMiniAction" onclick="downloadAttachment('${ref}','${inlineArg(a.name || 'voice.webm')}')">↪</button></div>`;
    }
    if (type.startsWith("image/") && url) {
      return `<div class=photoBubble><img class=photoPreview src="${h(url)}" alt="${h(a.name || "image")}" loading="lazy"><div class=photoOverlay><span>${h(a.name || "image")}</span><span>${fmt(a.size)}</span></div></div>`;
    }
    return baseAttHtml(a);
  };

  let activeVoice = null;
  const basePlayVoice = playVoice;
  window.playVoice = playVoice = async function nv133PlayVoice(event, ref){
    event?.stopPropagation?.();
    const button = event?.currentTarget;
    if (!button) return basePlayVoice(event, ref);
    const bubble = button.closest(".voiceBubble");
    if (activeVoice?.audio && activeVoice.ref !== ref) {
      try { activeVoice.audio.pause(); } catch {}
      activeVoice.button && (activeVoice.button.textContent = "▶");
      activeVoice.bubble?.classList.remove("playing");
    }
    if (button.audio && !button.audio.paused) {
      button.audio.pause();
      button.textContent = "▶";
      bubble?.classList.remove("playing");
      activeVoice = null;
      return;
    }
    const url = await hydrateFile(ref);
    if (!url) return toast("Голосовое недоступно.");
    const audio = button.audio || new Audio(url);
    audio.preload = "auto";
    button.audio = audio;
    button.textContent = "⏸";
    bubble?.classList.add("playing");
    activeVoice = { ref, audio, button, bubble };
    audio.onerror = () => { button.textContent = "▶"; bubble?.classList.remove("playing"); if (activeVoice?.audio === audio) activeVoice = null; toast("Не удалось открыть голосовое сообщение."); };
    audio.onended = () => { button.textContent = "▶"; bubble?.classList.remove("playing"); if (activeVoice?.audio === audio) activeVoice = null; };
    audio.play().catch((error) => { button.textContent = "▶"; bubble?.classList.remove("playing"); toast("Не удалось проиграть: " + (error.message || error)); });
  };

  function snapshotVoice() {
    if (!activeVoice?.audio || activeVoice.audio.paused) return null;
    return { ref: activeVoice.ref, time: activeVoice.audio.currentTime || 0 };
  }
  function resumeVoice(snap) {
    if (!snap) return;
    requestAnimationFrame(async () => {
      const btn = document.querySelector(`.voiceBubble[data-ref="${CSS.escape(snap.ref)}"] .voicePlay`);
      if (!btn) return;
      const url = await hydrateFile(snap.ref);
      if (!url) return;
      const audio = new Audio(url);
      audio.currentTime = Math.max(0, snap.time || 0);
      btn.audio = audio;
      btn.textContent = "⏸";
      const bubble = btn.closest(".voiceBubble");
      bubble?.classList.add("playing");
      activeVoice = { ref: snap.ref, audio, button: btn, bubble };
      audio.onended = () => { btn.textContent = "▶"; bubble?.classList.remove("playing"); if (activeVoice?.audio === audio) activeVoice = null; };
      audio.play().catch(()=>{});
    });
  }

  const baseRenderMessagesOnly = renderMessagesOnly;
  window.renderMessagesOnly = renderMessagesOnly = function nv133RenderMessagesOnly(keepScroll = true) {
    const container = $("#msgs");
    const pos = container ? { top: container.scrollTop, active: S.active, distance: chatDistanceFromBottom(container) } : null;
    const voice = snapshotVoice();
    const userWasReading = pos && pos.distance > 180;
    baseRenderMessagesOnly(userWasReading ? true : keepScroll);
    if (pos && userWasReading) {
      requestAnimationFrame(() => { const m = $("#msgs"); if (m && pos.active === S.active) m.scrollTop = pos.top; toggleBottomBtn(); });
    }
    resumeVoice(voice);
  };

  const baseScrollChatBottom = scrollChatBottom;
  window.scrollChatBottom = scrollChatBottom = function nv133ScrollChatBottom(smooth = true) {
    const m = $("#msgs");
    if (m && S.nv133PreserveScroll) return toggleBottomBtn();
    return baseScrollChatBottom(smooth);
  };

  window.ctx = ctx = function nv133Ctx(e, id){
    e.preventDefault(); e.stopPropagation?.();
    document.querySelector(".ctx")?.remove();
    const message = findMsg(id);
    const mine = message?.from === S.user.username;
    const d = document.createElement("div");
    d.className = "ctx ctxRich ctxSafe";
    const quick = reactionList.map((emoji) => `<button class="reactQuick" onclick="react('${id}','${inlineArg(emoji)}')">${h(emoji)}</button>`).join("");
    d.innerHTML = `<button class="ctxClose" onclick="document.querySelector('.ctx')?.remove()">×</button><div class=ctxTitle>Реакция</div><div class=ctxReactions>${quick}</div><button onclick="S.replyTo='${id}';document.querySelector('.ctx')?.remove();stableRender({keepMessages:true})">Ответить</button><button onclick="toggleSelect('${id}');document.querySelector('.ctx')?.remove();renderMessagesOnly(true)">Выделить</button>${mine ? `<button onclick="startEdit('${id}')">Редактировать</button><button onclick="delMsg('${id}',1)">Удалить у всех</button>` : ""}<button onclick="pinMsg('${id}')">Закрепить</button><button onclick="delMsg('${id}',0)">Удалить у себя</button>`;
    const place = typeof positionFloatingMenu === "function" ? positionFloatingMenu : function(node,x,y){ document.body.appendChild(node); const r=node.getBoundingClientRect(); node.style.left=Math.max(12, Math.min(x, innerWidth-r.width-12))+"px"; node.style.top=Math.max(12, Math.min(y, innerHeight-r.height-12))+"px"; };
    place(d, e.clientX, e.clientY);
  };

  const baseReact = react;
  window.react = react = async function nv133React(id, encodedEmoji){
    const container = $("#msgs");
    const pos = container ? { top: container.scrollTop, distance: chatDistanceFromBottom(container), active: S.active } : null;
    await baseReact(id, encodedEmoji);
    if (pos && pos.distance > 180) requestAnimationFrame(() => { const m = $("#msgs"); if (m && pos.active === S.active) m.scrollTop = pos.top; toggleBottomBtn(); });
  };

  const baseSettingsPanel133 = settingsPanel;
  window.settingsPanel = settingsPanel = function nv133SettingsPanel(){
    return String(baseSettingsPanel133() || "")
      .replace(/<label>Правая панель[\s\S]*?<\/label>/, "")
      .replace(/NightVault [^<]+/g, "NightVault 1.3.9");
  };
  const baseSettingsPage133 = settingsPage;
  window.settingsPage = settingsPage = function nv133SettingsPage(){
    return String(baseSettingsPage133() || "").replace(/<h1>Настройки<br>[^<]+<\/h1>/, `<h1>Настройки<br>1.3.9</h1>`);
  };

  const baseApplyVisualPrefs = applyVisualPrefs;
  window.applyVisualPrefs = applyVisualPrefs = function nv133ApplyVisualPrefs(){
    S.rightPanel = true;
    try { localStorage.nvRightPanel = "1"; } catch {}
    baseApplyVisualPrefs();
    document.body.classList.remove("noRightPanel");
  };
})();


/* NightVault 1.3.9 — Crimson default, Radmin admin hosting, Telegram voice and photo viewer */
(function nv134Layer(){
  const HOTFIX_LABEL = "1.3.9";
  window.NV_HOTFIX_LABEL = HOTFIX_LABEL;
  try {
    if (!localStorage.nv134DefaultThemeApplied && !localStorage.nvTheme && !localStorage.nvAccent) {
      localStorage.nvTheme = "crimson";
      localStorage.nvAccent = "#e11b2f";
      localStorage.nvChatBg = "crimson";
      localStorage.nv134DefaultThemeApplied = "1";
    }
  } catch {}
  if (typeof S === "object") {
    S.theme = localStorage.nvTheme || S.theme || "crimson";
    S.accent = localStorage.nvAccent || S.accent || "#e11b2f";
    S.chatBg = localStorage.nvChatBg || S.chatBg || "crimson";
  }

  async function blobUrlToDataUrl(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(blob);
    });
  }

  window.openPhotoViewer = async function nv134OpenPhotoViewer(ref, encodedName){
    try {
      ref = attachmentRef(ref);
      const url = await hydrateFile(ref);
      if (!url) return toast("Фото недоступно или ещё не загружено.");
      const title = decodeURIComponent(encodedName || "Фото NightVault");
      const dataUrl = String(url).startsWith("blob:") ? await blobUrlToDataUrl(url) : url;
      const result = await nvBridge.openImageViewer?.({ src: dataUrl, title });
      if (!result?.ok) return openPhotoOverlay(dataUrl, title);
    } catch (error) {
      toast("Не удалось открыть просмотр фото: " + (error?.message || error));
    }
  };

  window.openPhotoOverlay = function nv134OpenPhotoOverlay(src, title = "Фото"){
    document.querySelector(".nvPhotoViewer")?.remove();
    const box = document.createElement("div");
    box.className = "nvPhotoViewer";
    box.innerHTML = `<div class="nvPhotoToolbar"><b>${h(title)}</b><button data-act="zin">＋</button><button data-act="zout">－</button><button data-act="reset">100%</button><button data-act="close">×</button></div><div class="nvPhotoStage"><img src="${h(src)}" alt="${h(title)}"></div>`;
    document.body.appendChild(box);
    const img = box.querySelector("img"); let z=1,x=0,y=0,drag=false,sx=0,sy=0;
    const draw=()=>{ img.style.setProperty("--z", z); img.style.setProperty("--x", x+"px"); img.style.setProperty("--y", y+"px"); };
    box.onclick=(e)=>{ const act=e.target?.dataset?.act; if(act==="close") box.remove(); if(act==="zin"){z=Math.min(8,z*1.18);draw();} if(act==="zout"){z=Math.max(.15,z/1.18);draw();} if(act==="reset"){z=1;x=0;y=0;draw();} };
    box.addEventListener("wheel",e=>{e.preventDefault(); z=Math.max(.15,Math.min(8,z*(e.deltaY<0?1.12:.88))); draw();},{passive:false});
    img.addEventListener("pointerdown",e=>{drag=true;sx=e.clientX-x;sy=e.clientY-y;img.setPointerCapture(e.pointerId);});
    img.addEventListener("pointermove",e=>{if(!drag)return;x=e.clientX-sx;y=e.clientY-sy;draw();});
    img.addEventListener("pointerup",()=>{drag=false;});
    draw();
  };

  const baseAttHtml134 = attHtml;
  window.attHtml = attHtml = function nv134AttHtml(a){
    if (!a) return "";
    const type = String(a.type || "");
    const ref = attachmentRef(a.url);
    const url = fileUrl(a.url);
    if (type.startsWith("audio/") && a.voice) {
      const duration = Math.max(0, Number(a.duration || 0));
      const mm = Math.floor(duration / 60);
      const ss = String(duration % 60).padStart(2, "0");
      const bars = Array.from({ length: 64 }, (_, i) => `<i style="height:${5 + ((i * 17) % 18)}px"></i>`).join("");
      return `<div class="voiceBubble voiceBubbleTG134" data-ref="${h(ref)}"><button class="voicePlay" onclick="playVoice(event,'${ref}')">▶</button><div class="voiceMain"><div class="voiceWave">${bars}</div><div class="voiceSub"><span class="voiceTime">${mm}:${ss}</span><span>${fmt(a.size || 0)}</span><span class="voiceDot">●</span></div></div><button class="voiceMiniAction" title="Скачать" onclick="downloadAttachment('${ref}','${inlineArg(a.name || 'voice.webm')}')">↪</button></div>`;
    }
    if (type.startsWith("image/") && url) {
      return `<button class="photoBubble photoBubble134" onclick="openPhotoViewer('${ref}','${inlineArg(a.name || 'image')}')" title="Открыть фото"><img class="photoPreview" src="${h(url)}" alt="${h(a.name || "image")}" loading="lazy"><div class="photoOverlay"><span>${h(a.name || "image")}</span><span>${fmt(a.size)}</span></div></button>`;
    }
    return baseAttHtml134(a);
  };

  const baseSettingsPanel134 = settingsPanel;
  window.settingsPanel = settingsPanel = function nv134SettingsPanel(){
    return String(baseSettingsPanel134() || "").replace(/NightVault [^<]+/g, "NightVault 1.3.9");
  };
  const baseSettingsPage134 = settingsPage;
  window.settingsPage = settingsPage = function nv134SettingsPage(){
    return String(baseSettingsPage134() || "").replace(/<h1>Настройки<br>[^<]+<\/h1>/, `<h1>Настройки<br>1.3.9</h1>`).replace(/Настройки 1\.3\.\d+/g, "Настройки 1.3.9");
  };

  const baseApplyVisualPrefs134 = applyVisualPrefs;
  window.applyVisualPrefs = applyVisualPrefs = function nv134ApplyVisualPrefs(){
    if (!S.theme) S.theme = "crimson";
    if (!S.accent) S.accent = "#e11b2f";
    baseApplyVisualPrefs134();
    document.documentElement.style.setProperty("--accent", normalizeHexColor(S.accent || "#e11b2f", "#e11b2f"));
  };
})();

/* NightVault 1.3.9 — live sync, styled group modals, real voice UI, contact notifications, group avatar */
(function nv135Layer(){
  const HOTFIX_LABEL = "1.3.9";
  window.NV_HOTFIX_LABEL = HOTFIX_LABEL;

  const baseToast135 = window.toast || toast;
  let serverToastShown = false;
  let lastServerToastAt = 0;
  window.toast = toast = function nv135Toast(text, ...rest) {
    const value = String(text || "");
    if (/Сервер подключен/i.test(value)) {
      const nowMs = Date.now();
      if (serverToastShown || nowMs - lastServerToastAt < 60_000) return;
      serverToastShown = true;
      lastServerToastAt = nowMs;
    }
    return baseToast135.call(this, text, ...rest);
  };

  function isVoiceLike(a) {
    if (!a) return false;
    const type = String(a.type || "").toLowerCase();
    const name = String(a.name || a.originalName || a.url || "").toLowerCase();
    return Boolean(a.voice) || type.startsWith("audio/") || /^voice[-_]/.test(name) || /\.(webm|ogg|oga|m4a|mp3|wav)$/i.test(name);
  }
  function voiceBars(count = 72) {
    return Array.from({ length: count }, (_, i) => `<i style="height:${5 + ((i * 19 + 7) % 24)}px"></i>`).join("");
  }
  function voiceDuration(a) {
    const duration = Math.max(0, Math.trunc(Number(a?.duration || 0)));
    return `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  }

  const baseAttHtml135 = attHtml;
  window.attHtml = attHtml = function nv135AttHtml(a) {
    if (!a) return "";
    const ref = attachmentRef(a.url || a.id);
    const url = fileUrl(a.url || a.id);
    if (isVoiceLike(a)) {
      return `<div class="voiceBubble voiceBubbleNV135" data-ref="${h(ref)}" data-name="${h(a.name || 'voice.webm')}"><button class="voicePlay" onclick="playVoice(event,'${h(ref)}')" title="Воспроизвести">▶</button><div class="voiceMain"><div class="voiceWave" aria-hidden="true">${voiceBars()}</div><div class="voiceSub"><span class="voiceTime">${voiceDuration(a)}</span><span>${fmt(a.size || 0)}</span><span class="voiceDot">●</span></div></div><button class="voiceMiniAction" title="Скачать" onclick="downloadAttachment('${h(ref)}','${inlineArg(a.name || 'voice.webm')}')">↪</button></div>`;
    }
    return baseAttHtml135(a);
  };

  const baseMsgHtml135 = msgHtml;
  window.msgHtml = msgHtml = function nv135MsgHtml(m) {
    let html = String(baseMsgHtml135(m) || "")
      .replace(/<div class=msgText>🔐 Зашифрованное сообщение<\/div>/g, "")
      .replace(/<div class=msgText>🔒 Зашифрованное сообщение<\/div>/g, "");
    const a = m?.decryptedAttachment || m?.attachment;
    if (isVoiceLike(a) && !(m.decryptedText || m.text || "").trim()) {
      html = html.replace(/class="msg ([^"]*)"/, (all, cls) => `class="msg ${cls} voiceMsg"`);
    }
    return html;
  };

  function messageSignature(messages) {
    return (messages || []).map((m) => `${m.id}:${m.editedAt || 0}:${Object.keys(m.reactions || {}).map((k)=>k+":"+(m.reactions[k]||[]).length).join(',')}:${m.readBy?.length || 0}:${m.deliveredTo?.length || 0}`).join("|");
  }
  async function refreshActiveChatSoft() {
    if (!S.user || !S.token || !S.active) return;
    if (document.hidden) return;
    try {
      const old = S.messages[S.active] || [];
      const oldSig = messageSignature(old);
      const response = await api("/chats/" + encodeURIComponent(S.active) + "/messages?limit=100");
      const next = response.messages || [];
      await decryptMessagesInPlace(next);
      const chat = currentChat();
      await hydrateAssets([chat, ...next.map((m) => m.decryptedAttachment || m.attachment || m)]);
      const nextSig = messageSignature(next);
      if (oldSig !== nextSig) {
        const box = $("#msgs");
        const reading = box && chatDistanceFromBottom(box) > 180;
        const top = box?.scrollTop || 0;
        S.messages[S.active] = next;
        S.nextCursors[S.active] = response.nextCursor || S.nextCursors[S.active] || null;
        renderMessagesOnly(true);
        requestAnimationFrame(() => { const fresh = $("#msgs"); if (fresh && reading) fresh.scrollTop = top; });
      }
    } catch {}
  }
  async function refreshChatsSoft() {
    if (!S.user || !S.token) return;
    try { await loadChats(false); if (typeof renderChatListOnly === "function") renderChatListOnly(); } catch {}
  }

  let contactKnownIncoming = new Set();
  function incomingSet() {
    return new Set((S.contacts?.incoming || []).map((x) => x.user?.username || x.username).filter(Boolean));
  }
  async function refreshContactsSoft() {
    if (!S.user || !S.token) return;
    try {
      const before = contactKnownIncoming.size ? contactKnownIncoming : incomingSet();
      const response = await api("/contacts");
      S.contacts = response.contacts || S.contacts;
      await hydrateAssets([...(S.contacts.accepted || []).map((item) => item.user), ...(S.contacts.incoming || []).map((item) => item.user), ...(S.contacts.outgoing || []).map((item) => item.user)]);
      const after = incomingSet();
      for (const username of after) {
        if (!before.has(username)) {
          toast(`Новая заявка в контакты от @${username}`);
          notifyNew("NightVault контакты", `@${username} отправил заявку в контакты`);
        }
      }
      contactKnownIncoming = after;
      if (S.tab === "contacts") render();
    } catch {}
  }
  if (!window.__nv135LiveTimers) {
    window.__nv135LiveTimers = true;
    setInterval(refreshActiveChatSoft, 25000);
    setInterval(refreshChatsSoft, 30000);
    setInterval(refreshContactsSoft, 28000);
  }

  window.nv135StyledConfirm = function nv135StyledConfirm(title, text, yesText, onYesCode) {
    modal(`<div class="nvConfirm"><h2>${h(title)}</h2><p>${h(text)}</p><div class="buttonRow"><button class="btn" onclick="${onYesCode};closeModal()">${h(yesText || 'OK')}</button><button class="btn ghost" onclick="closeModal()">Отмена</button></div></div>`);
  };

  window.transferGroupOwner = async function nv135TransferGroupOwner(username) {
    username = String(username || "");
    nv135StyledConfirm("Передача прав владельца", `Передать права владельца @${username}?`, "Передать", `nv135TransferGroupOwnerNow('${h(username)}')`);
  };
  window.nv135TransferGroupOwnerNow = async function nv135TransferGroupOwnerNow(username) {
    try {
      await api(`/chats/${S.active}/owner`, { method: "POST", body: JSON.stringify({ username }) });
      await loadChats(false);
      closeModal();
      await groupSettings();
      toast("Права владельца переданы");
    } catch (error) { toast(error.message || error); }
  };


  window.nv135LoadContactsToGroup = async function nv135LoadContactsToGroup() {
    try { await loadContacts(false); nv135FillContactsToGroup(); } catch (error) { toast("Контакты не загружены: " + (error.message || error)); }
  };

  window.nv135FillContactsToGroup = function nv135FillContactsToGroup() {
    const names = (S.contacts?.accepted || []).map((item) => item.user?.username).filter(Boolean);
    const input = $("#gsAddMembers");
    if (!input) return;
    const existing = String(input.value || "").split(",").map((x)=>x.trim()).filter(Boolean);
    input.value = [...new Set([...existing, ...names])].join(", ");
    toast("Контакты добавлены в список участников");
  };
  window.nv135PickGroupAvatar = async function nv135PickGroupAvatar() {
    try {
      const files = await pickDomFiles({ accept: "image/png,image/jpeg,image/webp,image/gif", multiple: false });
      const file = files?.[0];
      if (!file) return;
      const uploaded = await uploadBrowserFile(file);
      window.nv135GroupAvatarUploaded = uploaded;
      const preview = fileUrl(uploaded.url || uploaded.id);
      const box = $("#gsAvatarPreview");
      if (box) box.innerHTML = `<img src="${h(preview)}" alt="avatar"><span>${h(uploaded.name || file.name)}</span>`;
      toast("Аватарка группы выбрана");
    } catch (error) { toast("Аватарка группы не загружена: " + (error.message || error)); }
  };

  window.groupSettings = async function nv135GroupSettings() {
    document.querySelector(".ctx")?.remove();
    const chat = currentChat();
    if (!chat || !["group", "channel"].includes(chat.type)) return toast("Это не группа");
    const isAdmin = chat.admins?.includes(S.user.username);
    const isOwner = chat.owner === S.user.username;
    window.nv135GroupAvatarUploaded = null;
    const members = (chat.members || []).map((username) => {
      const badges = [username === chat.owner ? "владелец" : "", chat.admins?.includes(username) && username !== chat.owner ? "админ" : ""].filter(Boolean).join(", ");
      const actions = username === S.user.username ? "" : `${isAdmin && username !== chat.owner ? `<button class='btn danger' onclick="removeGroupMember('${h(username)}')">Удалить</button>` : ""}${isOwner ? `<button class='btn ghost' onclick="transferGroupOwner('${h(username)}')">Передать права</button>` : ""}`;
      return `<div class="fileCard memberRow"><span>👤 @${h(username)}${badges ? `<small>${h(badges)}</small>` : ""}</span>${actions}</div>`;
    }).join("");
    const contactsButton = (S.contacts?.accepted || []).length ? `<button class="btn ghost" onclick="nv135FillContactsToGroup()">Добавить все контакты</button>` : `<button class="btn ghost" onclick="nv135LoadContactsToGroup()">Загрузить контакты</button>`;
    modal(`<h2>Настройки ${chat.type === "channel" ? "канала" : "группы"}</h2><input id="gsTitle" class="field" value="${h(chat.title || "")}"><textarea id="gsDesc" class="field" placeholder="Описание">${h(chat.description || "")}</textarea><div class="groupAvatarPick"><div id="gsAvatarPreview" class="groupAvatarPreview">${chat.avatar ? `<img src="${h(fileUrl(chat.avatar))}" alt="avatar"><span>Текущая аватарка</span>` : `<span>Аватарка группы не выбрана</span>`}</div><button class="btn ghost" onclick="nv135PickGroupAvatar()">Поставить аватарку группы</button></div><label class="fileCard"><input id="gsWrite" type="checkbox" ${chat.permissions?.write !== false ? "checked" : ""} ${chat.type === "channel" ? "disabled" : ""}> Участники могут писать</label><label class="fileCard"><input id="gsInvite" type="checkbox" ${chat.permissions?.invite !== false ? "checked" : ""}> Участники могут приглашать</label><label class="fileCard"><input id="gsAvatar" type="checkbox" ${chat.permissions?.avatar ? "checked" : ""}> Участники могут менять аватар/описание</label><h3>Добавить участников</h3><div class="groupAddRow"><input id="gsAddMembers" class="field" placeholder="user1, user2">${contactsButton}</div><h3>Участники</h3>${members}<div class="buttonRow"><button class="btn" onclick="saveGroupSettings()">Сохранить</button><button class="btn danger" onclick="leaveGroup()">Покинуть ${chat.type === "channel" ? "канал" : "группу"}</button></div>`);
  };

  window.saveGroupSettings = async function nv135SaveGroupSettings() {
    try {
      const additions = String($("#gsAddMembers")?.value || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      const permissions = { write: Boolean($("#gsWrite")?.checked), invite: Boolean($("#gsInvite")?.checked), avatar: Boolean($("#gsAvatar")?.checked) };
      const body = { title: $("#gsTitle")?.value, description: $("#gsDesc")?.value, permissions, addMembers: additions };
      if (window.nv135GroupAvatarUploaded) body.avatar = window.nv135GroupAvatarUploaded.url || window.nv135GroupAvatarUploaded.id;
      const response = await api("/chats/" + S.active, { method: "PUT", body: JSON.stringify(body) });
      const idx = S.chats.findIndex((chat) => chat.id === S.active);
      if (idx >= 0 && response.chat) S.chats[idx] = response.chat;
      closeModal();
      await loadChats(false);
      render();
      toast("Настройки группы сохранены");
    } catch (error) { toast(error.message || error); }
  };

  const baseSettingsPanel135 = settingsPanel;
  window.settingsPanel = settingsPanel = function nv135SettingsPanel(){ return String(baseSettingsPanel135() || "").replace(/NightVault [^<]+/g, "NightVault 1.3.9"); };
  const baseSettingsPage135 = settingsPage;
  window.settingsPage = settingsPage = function nv135SettingsPage(){ return String(baseSettingsPage135() || "").replace(/<h1>Настройки<br>[^<]+<\/h1>/, `<h1>Настройки<br>1.3.9</h1>`).replace(/Настройки 1\.3\.\d+/g, "Настройки 1.3.9"); };
})();

/* NightVault 1.3.9 — quiet onboarding, stable live rendering, profile/banner/photo/voice fixes */
(function nv136Layer(){
  const HOTFIX_LABEL = "1.3.9";
  window.NV_HOTFIX_LABEL = HOTFIX_LABEL;
  try { localStorage.nvAppVersion = HOTFIX_LABEL; } catch {}
  if (typeof S === "object") S.appVersion = HOTFIX_LABEL;

  // Старые welcome / mega-release окна больше не показываем после входа.
  window.nv120ShowOnboarding = nv120ShowOnboarding = function nv136NoOnboarding() {};
  if (typeof showChangelogModal === "function") window.showChangelogModal = showChangelogModal = function nv136NoChangelog() {};

  const baseCssImageUrl136 = cssImageUrl;
  window.cssImageUrl = cssImageUrl = function nv136CssImageUrl(url) {
    const safe = String(url || "").replace(/[\"\n\r\f]/g, "");
    return safe ? `background-image:url("${h(safe)}")!important;background-size:cover!important;background-position:center!important;` : baseCssImageUrl136(url);
  };

  const baseAv136 = av;
  window.av = av = function nv136Avatar(u, cls = "avatar") {
    const color = normalizeHexColor(u?.profileColor || S?.user?.profileColor || S?.accent || "#e11b2f", "#e11b2f");
    const html = String(baseAv136(u, cls) || "");
    if (!html) return html;
    const style = `--profileColor:${color};background:linear-gradient(135deg,color-mix(in srgb,${color} 24%,#111),${color});box-shadow:0 0 0 2px color-mix(in srgb,${color} 50%,transparent),0 0 34px color-mix(in srgb,${color} 34%,transparent);`;
    if (/^<img\b/i.test(html)) return html.replace(/<img\b/, `<img style="${h(style)}"`);
    if (/^<div\b/i.test(html)) return html.replace(/<div\b/, `<div style="${h(style)}"`);
    return html;
  };

  async function openBlobOrFilePhoto(ref, encodedName) {
    ref = attachmentRef(ref);
    if (!ref) return toast("Фото недоступно.");
    const title = decodeURIComponent(encodedName || "Фото NightVault");
    let url = fileUrl(ref);
    if (!url) url = await hydrateFile(ref);
    if (!url) return toast("Фото ещё не загружено.");
    // Не конвертируем blob через fetch: в установленном Electron это иногда даёт Failed to fetch.
    return openPhotoOverlay(url, title);
  }
  window.openPhotoViewer = openPhotoViewer = function nv136OpenPhotoViewer(ref, encodedName) {
    openBlobOrFilePhoto(ref, encodedName).catch((error) => toast("Не удалось открыть просмотр фото: " + (error?.message || error)));
  };

  function focusSnapshot() {
    const el = document.activeElement;
    if (!el || !el.id) return null;
    if (!/^(q|person|contactsLocalSearch|global|adminCmd|gsAddMembers|profileColor|pd|pb)$/.test(el.id)) return null;
    return { id: el.id, value: el.value, start: el.selectionStart, end: el.selectionEnd };
  }
  function restoreFocusSnapshot(snap) {
    if (!snap) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(snap.id);
      if (!el) return;
      if (typeof snap.value === "string") el.value = snap.value;
      try { el.focus({ preventScroll: true }); el.setSelectionRange?.(snap.start ?? snap.value?.length ?? 0, snap.end ?? snap.value?.length ?? 0); } catch {}
    });
  }
  const baseRender136 = render;
  window.render = render = function nv136Render() {
    const snap = focusSnapshot();
    baseRender136();
    restoreFocusSnapshot(snap);
  };

  function chatListFingerprint() {
    return (filteredChats() || []).map((c) => `${c.id}:${c.updatedAt||0}:${c.unread||0}:${c.last?.id||''}:${c.last?.editedAt||0}:${c.last?.text||''}:${c.last?.attachment?.id||c.last?.attachment?.url||''}`).join("|");
  }
  const baseRenderChatListOnly136 = renderChatListOnly;
  let lastChatListFp136 = "";
  window.renderChatListOnly = renderChatListOnly = function nv136RenderChatListOnly() {
    const next = chatListFingerprint();
    const focusedSearch = document.activeElement?.id === "q";
    if (next === lastChatListFp136 && !focusedSearch) return;
    const list = document.querySelector(".chatList");
    const top = list?.scrollTop || 0;
    lastChatListFp136 = next;
    baseRenderChatListOnly136();
    requestAnimationFrame(() => { const fresh = document.querySelector(".chatList"); if (fresh) fresh.scrollTop = top; });
  };

  // Более устойчивый рендер контактов: не стираем поиск при live refresh.

  window.nv136RefreshContactsRender = async function nv136RefreshContactsRender(){ await loadContacts(false); render(); };
  const baseContactsPage136 = contactsPage;
  window.contactsPage = contactsPage = function nv136ContactsPage() {
    return String(baseContactsPage136() || "").replace('onclick="loadContacts(true)"', 'onclick="nv136RefreshContactsRender()"');
  };

  function isVoice136(a) {
    const type = String(a?.type || "").toLowerCase();
    const name = String(a?.name || a?.originalName || a?.url || "").toLowerCase();
    return Boolean(a?.voice) || type.startsWith("audio/") || /^voice[-_]/.test(name) || /\.(webm|ogg|oga|m4a|mp3|wav)$/i.test(name);
  }
  function voiceBars136(count = 58) {
    return Array.from({ length: count }, (_, i) => `<i style="--h:${6 + ((i * 23 + 11) % 25)}px"></i>`).join("");
  }
  function voiceDuration136(a) {
    const duration = Math.max(0, Math.trunc(Number(a?.duration || 0)));
    return `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  }
  const baseAttHtml136 = attHtml;
  window.attHtml = attHtml = function nv136AttHtml(a) {
    if (!a) return "";
    const ref = attachmentRef(a.url || a.id);
    const type = String(a.type || "");
    const url = fileUrl(a.url || a.id);
    if (isVoice136(a)) {
      return `<div class="voiceBubble voiceBubbleNV136" data-ref="${h(ref)}"><button class="voicePlay" onclick="playVoice(event,'${h(ref)}')" title="Воспроизвести">▶</button><div class="voiceMain"><div class="voiceWave" aria-hidden="true">${voiceBars136()}</div><div class="voiceSub"><span class="voiceTime">${voiceDuration136(a)}</span><span>${fmt(a.size || 0)}</span><span class="voiceDot">●</span></div></div><button class="voiceMiniAction" title="Скачать" onclick="downloadAttachment('${h(ref)}','${inlineArg(a.name || 'voice.webm')}')">↪</button></div>`;
    }
    if (type.startsWith("image/") && (url || ref)) {
      const src = url || "";
      return `<button class="photoBubble photoBubble136" onclick="openPhotoViewer('${h(ref)}','${inlineArg(a.name || 'image')}')" title="Открыть фото">${src ? `<img class="photoPreview" src="${h(src)}" alt="${h(a.name || 'image')}" loading="lazy">` : ""}<div class="photoOverlay"><span>${h(a.name || 'image')}</span><span>${fmt(a.size || 0)}</span></div></button>`;
    }
    return baseAttHtml136(a);
  };

  // Профиль: цвет применяется сразу, баннер принудительно гидратится и отображается.
  const baseProfilePage136 = profilePage;
  window.profilePage = profilePage = function nv136ProfilePage() {
    if (S.user?.banner && !assetDisplayUrl(S.user, "banner")) hydrateFile(attachmentRef(S.user.banner)).then(() => { if (S.tab === "profile") render(); }).catch(() => {});
    return String(baseProfilePage136() || "").replace(/<h1>Мой профиль<\/h1>/, `<h1>Мой профиль</h1><div class="muted">Цвет профиля влияет на аватар, подсветку и карточку профиля.</div>`);
  };

  const baseSaveProfile136 = saveProfile;
  window.saveProfile = saveProfile = async function nv136SaveProfile() {
    await baseSaveProfile136();
    if (S.user) S.user.profileColor = $("#profileColor")?.value || S.user.profileColor;
    applyVisualPrefs();
    render();
  };

  // Не даём старым replace-обёрткам возвращать 1.2.0 Mega Release.
  const baseSettingsPanel136 = settingsPanel;
  window.settingsPanel = settingsPanel = function nv136SettingsPanel() {
    return String(baseSettingsPanel136() || "").replace(/NightVault 1\.2\.0 Mega Release/g, "NightVault 1.3.9").replace(/Messenger Features Update:/g, "NightVault 1.3.9:").replace(/1\.3\.5/g, "1.3.9");
  };
  const baseSettingsPage136 = settingsPage;
  window.settingsPage = settingsPage = function nv136SettingsPage() {
    return String(baseSettingsPage136() || "").replace(/1\.3\.5/g, "1.3.9").replace(/Messenger Features Update:/g, "NightVault 1.3.9:");
  };
})();

/* NightVault 1.3.9 — Messenger Features Update: partial render, WS-first live events, custom voice, media viewer */
(function nv137PerformanceUxLayer(){
  const VERSION = "1.3.9";
  window.NV_HOTFIX_LABEL = VERSION;
  try { localStorage.nvAppVersion = VERSION; } catch {}
  try { if (S) S.appVersion = VERSION; } catch {}

  const nv137 = window.__nv137 = window.__nv137 || {
    hashes: {},
    wsOpen: false,
    connectedToastShown: false,
    activeVoice: null,
    voiceTick: null,
    media: { items: [], index: 0, zoom: 1, x: 0, y: 0, drag: null },
  };

  function stableString(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
      if (typeof val === "function") return undefined;
      if (val && typeof val === "object") {
        if (seen.has(val)) return undefined;
        seen.add(val);
        if (!Array.isArray(val)) {
          const out = {};
          for (const k of Object.keys(val).sort()) out[k] = val[k];
          return out;
        }
      }
      return val;
    });
  }
  function tinyHash(value) {
    const s = stableString(value);
    let hval = 2166136261;
    for (let i = 0; i < s.length; i += 1) hval = Math.imul(hval ^ s.charCodeAt(i), 16777619);
    return String(hval >>> 0) + ":" + s.length;
  }
  function chatFingerprint() {
    return tinyHash((S.chats || []).map((c) => ({ id:c.id, type:c.type, title:c.title, avatar:c.avatar, updatedAt:c.updatedAt, unread:c.unread, last:c.last ? { id:c.last.id, text:c.last.decryptedText || c.last.text, at:c.last.createdAt, editedAt:c.last.editedAt, reactions:c.last.reactions, attachment:c.last.decryptedAttachment?.id || c.last.attachment?.id || c.last.attachment?.url } : null, other:c.other ? { username:c.other.username, displayName:c.other.displayName, avatar:c.other.avatar, profileColor:c.other.profileColor, lastSeen:c.other.lastSeen, status:c.other.status } : null })));
  }
  function messagesFingerprint(chatId = S.active) {
    return tinyHash((S.messages?.[chatId] || []).map((m) => ({ id:m.id, from:m.from, text:m.decryptedText || m.text, at:m.createdAt, editedAt:m.editedAt, deleted:m.deletedForAll, reactions:m.reactions, deliveredTo:m.deliveredTo, readBy:m.readBy, att:m.decryptedAttachment ? { id:m.decryptedAttachment.id, url:m.decryptedAttachment.url, name:m.decryptedAttachment.name, size:m.decryptedAttachment.size, type:m.decryptedAttachment.type, voice:m.decryptedAttachment.voice } : m.attachment ? { id:m.attachment.id, url:m.attachment.url, name:m.attachment.name, size:m.attachment.size, type:m.attachment.type, voice:m.attachment.voice } : null })));
  }
  function contactsFingerprint() {
    return tinyHash(S.contacts || {});
  }
  function profileFingerprint() {
    return tinyHash({ user:S.user, active:S.active, tab:S.tab, settings:S.settings, theme:S.theme, accent:S.accent });
  }

  function focusSnapshot137() {
    const el = document.activeElement;
    if (!el || !el.id) return null;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return null;
    return { id: el.id, value: "value" in el ? el.value : "", start: el.selectionStart ?? null, end: el.selectionEnd ?? null };
  }
  function restoreFocus137(snap) {
    if (!snap) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(snap.id);
      if (!el) return;
      if ("value" in el && el.value !== snap.value) el.value = snap.value;
      try { el.focus({ preventScroll: true }); if (typeof snap.start === "number") el.setSelectionRange?.(snap.start, snap.end ?? snap.start); } catch {}
    });
  }
  function scrollSnapshot137() {
    const m = $("#msgs");
    return m ? { chat:S.active, top:m.scrollTop, height:m.scrollHeight, dist:chatDistanceFromBottom(m) } : null;
  }
  function restoreScroll137(snap, force = false) {
    if (!snap) return;
    requestAnimationFrame(() => {
      const m = $("#msgs");
      if (!m || S.active !== snap.chat) return;
      if (force || snap.dist > 160) m.scrollTop = Math.max(0, snap.top + (m.scrollHeight - snap.height));
      else scrollChatBottom(false);
      toggleBottomBtn();
    });
  }

  function renderCenterOnly(reason = "center") {
    const main = document.querySelector("main.main");
    if (!main) return render();
    const focus = focusSnapshot137();
    const scroll = scrollSnapshot137();
    main.innerHTML = safeRenderBlock(reason, "", () => renderCenter());
    bind();
    restoreFocus137(focus);
    restoreScroll137(scroll, true);
    if (S.tab === "chats") requestAnimationFrame(() => ensureChatBottomWatch?.());
  }
  function renderSideOnly(reason = "side") {
    const side = document.querySelector("aside.side");
    if (!side) return render();
    side.innerHTML = safeRenderBlock(reason, "", () => renderSide());
  }
  function renderLeftOnly(reason = "left") {
    const old = document.querySelector("section.list");
    if (!old) return render();
    const focus = focusSnapshot137();
    old.outerHTML = safeRenderBlock(reason, "", () => renderLeft());
    bind();
    restoreFocus137(focus);
  }
  window.nv137RenderCenterOnly = renderCenterOnly;
  window.nv137RenderSideOnly = renderSideOnly;
  window.nv137RenderLeftOnly = renderLeftOnly;

  const baseRender137 = render;
  window.render = render = function nv137Render() {
    const focus = focusSnapshot137();
    const scroll = scrollSnapshot137();
    const voice = snapshotVoice137();
    baseRender137();
    restoreFocus137(focus);
    restoreScroll137(scroll, true);
    resumeVoice137(voice);
    nv137.hashes.chats = chatFingerprint();
    nv137.hashes.messages = messagesFingerprint();
    nv137.hashes.contacts = contactsFingerprint();
    nv137.hashes.profile = profileFingerprint();
  };

  const baseRenderChatListOnly137 = renderChatListOnly;
  window.renderChatListOnly = renderChatListOnly = function nv137RenderChatListOnly() {
    const next = chatFingerprint();
    if (next === nv137.hashes.chats && document.activeElement?.id === "q") return;
    const list = document.querySelector(".chatList");
    const top = list?.scrollTop || 0;
    baseRenderChatListOnly137();
    nv137.hashes.chats = next;
    requestAnimationFrame(() => { const fresh = document.querySelector(".chatList"); if (fresh) fresh.scrollTop = top; });
  };

  const baseLoadChats137 = loadChats;
  window.loadChats = loadChats = async function nv137LoadChats(draw = true) {
    const before = chatFingerprint();
    await baseLoadChats137(false);
    const after = chatFingerprint();
    if (draw && before !== after) {
      if (S.tab === "chats") { renderChatListOnly(); renderSideOnly("chat-side"); }
      else render();
    }
    return S.chats;
  };

  const baseLoadContacts137 = loadContacts;
  window.loadContacts = loadContacts = async function nv137LoadContacts(draw = true) {
    const before = contactsFingerprint();
    await baseLoadContacts137(false);
    const after = contactsFingerprint();
    if (draw && before !== after) {
      if (S.tab === "contacts") renderCenterOnly("contacts");
      else renderSideOnly("contacts-side");
    }
    return S.contacts;
  };

  const baseRenderMessagesOnly137 = renderMessagesOnly;
  window.renderMessagesOnly = renderMessagesOnly = function nv137RenderMessagesOnly(keepScroll = true) {
    const before = nv137.hashes.messages;
    const after = messagesFingerprint();
    if (before === after && keepScroll) return;
    const scroll = scrollSnapshot137();
    const voice = snapshotVoice137();
    const reading = scroll && scroll.dist > 160;
    baseRenderMessagesOnly137(reading ? true : keepScroll);
    nv137.hashes.messages = messagesFingerprint();
    restoreScroll137(scroll, reading);
    resumeVoice137(voice);
  };

  function patchSocket137() {
    if (!sock || sock.__nv137Patched) return;
    sock.__nv137Patched = true;
    const oldClose = sock.onclose;
    sock.onopen = () => {
      nv137.wsOpen = true;
      if (!nv137.connectedToastShown) { nv137.connectedToastShown = true; toast("Сервер подключен"); }
      flushOfflineQueue();
    };
    sock.onerror = () => { nv137.wsOpen = false; };
    sock.onclose = (event) => { nv137.wsOpen = false; oldClose?.(event); };
    sock.onmessage = (event) => handleWsEvent137(event).catch((error) => toast("Ошибка live-события: " + (error?.message || error)));
  }
  const baseConnect137 = connect;
  window.connect = connect = async function nv137Connect() {
    const result = await baseConnect137();
    patchSocket137();
    return result;
  };

  async function handleWsEvent137(event) {
    const payload = JSON.parse(event.data);
    const type = String(payload.type || "").replace(/_/g, ":");
    if (type === "message") {
      const msg = payload.message;
      S.messages[msg.chatId] = S.messages[msg.chatId] || [];
      await decryptMessage(msg);
      const arr = S.messages[msg.chatId];
      const idx = arr.findIndex((m) => m.id === msg.id);
      if (idx >= 0) arr[idx] = msg; else arr.push(msg);
      await hydrateAssets([msg.decryptedAttachment || msg.attachment || msg, payload.chat]);
      if (payload.chat) {
        const cIdx = S.chats.findIndex((c) => c.id === payload.chat.id);
        if (cIdx >= 0) S.chats[cIdx] = payload.chat; else S.chats.unshift(payload.chat);
      } else await loadChats(false).catch(() => {});
      if (S.active === msg.chatId) renderMessagesOnly(false); else renderChatListOnly();
      renderSideOnly("message-side");
      if (S.active !== msg.chatId && msg.from !== S.user.username) {
        const chat = S.chats.find((value) => value.id === msg.chatId);
        if (S.settings.notify !== false && !chat?.muted?.[S.user.username]) notifyNew(chat?.title || chat?.other?.displayName || "NightVault", msg.decryptedText || msg.text || msg.decryptedAttachment?.name || msg.attachment?.name || "Новое сообщение");
      }
      return;
    }
    if (type === "message:update") {
      await decryptMessage(payload.message);
      replaceMsg(payload.message);
      await hydrateAssets([payload.message.decryptedAttachment || payload.message.attachment || payload.message]);
      renderMessagesOnly(true);
      renderChatListOnly();
      return;
    }
    if (type === "message:delete") {
      for (const key in S.messages) S.messages[key] = S.messages[key].filter((message) => message.id !== payload.id);
      S.selected.delete(payload.id);
      renderMessagesOnly(true);
      renderChatListOnly();
      return;
    }
    if (type === "chat:update") {
      if (payload.chat) {
        const idx = S.chats.findIndex((chat) => chat.id === payload.chat.id);
        if (idx >= 0) S.chats[idx] = payload.chat; else S.chats.unshift(payload.chat);
        await hydrateAssets([payload.chat]);
      } else await loadChats(false).catch(() => {});
      renderChatListOnly();
      if (S.tab === "chats") { renderCenterOnly("chat-update"); renderSideOnly("chat-update-side"); }
      return;
    }
    if (type === "chat:removed") {
      S.chats = S.chats.filter((chat) => chat.id !== payload.chatId);
      if (S.active === payload.chatId) S.active = null;
      render();
      return;
    }
    if (type === "contacts:update") {
      const oldIncoming = new Set((S.contacts?.incoming || []).map((x) => x.user?.username || x.username));
      S.contacts = payload.contacts || S.contacts;
      await hydrateAssets([...(S.contacts.accepted || []).map((item) => item.user), ...(S.contacts.incoming || []).map((item) => item.user), ...(S.contacts.outgoing || []).map((item) => item.user)]);
      const nextIncoming = new Set((S.contacts?.incoming || []).map((x) => x.user?.username || x.username));
      for (const username of nextIncoming) if (!oldIncoming.has(username)) { toast(`Новая заявка в контакты от @${username}`); notifyNew("NightVault контакты", `@${username} отправил заявку в контакты`); }
      if (S.tab === "contacts") renderCenterOnly("contacts-update");
      renderSideOnly("contacts-side");
      return;
    }
    if (type === "typing") {
      S.typing[payload.chatId] = payload.active ? payload.user : null;
      renderTyping();
      setTimeout(() => { if (S.typing[payload.chatId] === payload.user) { delete S.typing[payload.chatId]; renderTyping(); } }, 2600);
      return;
    }
    if (["delivered", "read", "read:ack", "delivery:ack"].includes(type)) {
      if (payload.messageId) {
        const message = findMsg(payload.messageId);
        if (message) {
          const field = type.startsWith("read") ? "readBy" : "deliveredTo";
          message[field] = message[field] || [];
          if (!message[field].includes(payload.user)) message[field] = [...message[field], payload.user];
        }
      }
      renderMessagesOnly(true);
      renderChatListOnly();
    }
  }

  // Fallback polling: WebSocket is primary. The old fast intervals are slowed in source; this one runs only when WS is dead.
  if (!window.__nv137FallbackPolling) {
    window.__nv137FallbackPolling = true;
    setInterval(async () => {
      if (!S.user || !S.token || nv137.wsOpen || document.hidden) return;
      try { await loadChats(false); renderChatListOnly(); if (S.active) { const r = await api("/chats/" + encodeURIComponent(S.active) + "/messages?limit=100"); const next = r.messages || []; await decryptMessagesInPlace(next); if (tinyHash(next) !== tinyHash(S.messages[S.active] || [])) { S.messages[S.active] = next; S.nextCursors[S.active] = r.nextCursor || null; renderMessagesOnly(true); } } } catch {}
    }, 5000);
  }

  function isVoiceLike137(a) {
    const type = String(a?.type || "").toLowerCase();
    const name = String(a?.name || a?.originalName || a?.url || "").toLowerCase();
    return Boolean(a?.voice) || type.startsWith("audio/") || /^voice[-_]/.test(name) || /\.(webm|ogg|oga|m4a|mp3|wav)$/i.test(name);
  }
  function voiceBars137(count = 64) {
    return Array.from({ length: count }, (_, i) => `<i style="--h:${8 + ((i * 17 + 9) % 28)}px"></i>`).join("");
  }
  function durationText137(seconds) {
    seconds = Math.max(0, Math.trunc(Number(seconds || 0)));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,"0")}`;
  }
  function voiceMarkup137(a) {
    const ref = attachmentRef(a.url || a.id);
    return `<div class="voiceBubble voiceBubbleNV137" data-ref="${h(ref)}"><button class="voicePlay" onclick="playVoice(event,'${h(ref)}')" title="Воспроизвести">▶</button><button class="voiceWave" onclick="seekVoice137(event,'${h(ref)}')" aria-label="Перемотать">${voiceBars137()}</button><div class="voiceInfo"><span class="voiceTime">${durationText137(a.duration)}</span><span>${fmt(a.size || 0)}</span><span class="voiceDot">●</span></div><button class="voiceSpeed" onclick="cycleVoiceSpeed137(event,'${h(ref)}')">1x</button><button class="voiceMiniAction" title="Скачать" onclick="downloadAttachment('${h(ref)}','${inlineArg(a.name || 'voice.webm')}')">↪</button></div>`;
  }
  const baseAttHtml137 = attHtml;
  window.attHtml = attHtml = function nv137AttHtml(a) {
    if (!a) return "";
    const ref = attachmentRef(a.url || a.id);
    const type = String(a.type || "");
    const url = fileUrl(a.url || a.id);
    if (isVoiceLike137(a)) return voiceMarkup137(a);
    if (type.startsWith("image/") && (url || ref)) {
      return `<button class="photoBubble photoBubble137" onclick="openMediaViewerByRef137('${h(ref)}','${inlineArg(a.name || 'image')}')" title="Открыть фото">${url ? `<img class="photoPreview" src="${h(url)}" alt="${h(a.name || 'image')}" loading="lazy">` : ""}<div class="photoOverlay"><span>${h(a.name || 'image')}</span><span>${fmt(a.size || 0)}</span></div></button>`;
    }
    return baseAttHtml137(a);
  };

  function snapshotVoice137() {
    const av = nv137.activeVoice;
    if (!av?.audio || av.audio.paused) return null;
    return { ref: av.ref, time: av.audio.currentTime || 0, rate: av.audio.playbackRate || 1 };
  }
  function refreshVoiceUi137() {
    const av = nv137.activeVoice;
    if (!av?.audio || !av.bubble) return;
    const audio = av.audio;
    const pct = audio.duration ? Math.max(0, Math.min(1, audio.currentTime / audio.duration)) : 0;
    av.bubble.style.setProperty("--voiceProgress", String(pct));
    const t = av.bubble.querySelector(".voiceTime");
    if (t) t.textContent = durationText137(audio.currentTime || 0);
  }
  function stopVoiceTick137() { if (nv137.voiceTick) clearInterval(nv137.voiceTick); nv137.voiceTick = null; }
  function startVoiceTick137() { stopVoiceTick137(); nv137.voiceTick = setInterval(refreshVoiceUi137, 160); }
  window.playVoice = playVoice = async function nv137PlayVoice(event, ref) {
    event?.stopPropagation?.();
    const button = event?.currentTarget;
    const bubble = button?.closest?.(".voiceBubble");
    if (!button || !bubble) return;
    if (nv137.activeVoice?.audio && nv137.activeVoice.ref !== ref) {
      try { nv137.activeVoice.audio.pause(); } catch {}
      nv137.activeVoice.button && (nv137.activeVoice.button.textContent = "▶");
      nv137.activeVoice.bubble?.classList.remove("playing");
    }
    if (button.audio && !button.audio.paused) {
      button.audio.pause(); button.textContent = "▶"; bubble.classList.remove("playing"); stopVoiceTick137(); return;
    }
    const url = await hydrateFile(ref);
    if (!url) return toast("Голосовое недоступно.");
    const audio = button.audio || new Audio(url);
    button.audio = audio;
    audio.preload = "auto";
    audio.playbackRate = Number(bubble.dataset.rate || 1);
    button.textContent = "⏸";
    bubble.classList.add("playing");
    nv137.activeVoice = { ref, audio, button, bubble };
    audio.onerror = () => { button.textContent = "▶"; bubble.classList.remove("playing"); stopVoiceTick137(); toast("Не удалось открыть голосовое сообщение."); };
    audio.onended = () => { button.textContent = "▶"; bubble.classList.remove("playing"); stopVoiceTick137(); nv137.activeVoice = null; };
    startVoiceTick137();
    audio.play().catch((error) => { button.textContent = "▶"; bubble.classList.remove("playing"); stopVoiceTick137(); toast("Не удалось проиграть: " + (error.message || error)); });
  };
  window.seekVoice137 = async function nv137SeekVoice(event, ref) {
    event?.stopPropagation?.();
    const bubble = event.currentTarget.closest(".voiceBubble");
    const btn = bubble?.querySelector(".voicePlay");
    if (!btn?.audio) await playVoice({ currentTarget: btn, stopPropagation(){} }, ref);
    const audio = btn?.audio;
    if (!audio || !audio.duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(audio.duration, ((event.clientX - rect.left) / Math.max(1, rect.width)) * audio.duration));
    refreshVoiceUi137();
  };
  window.cycleVoiceSpeed137 = function nv137CycleVoiceSpeed(event, ref) {
    event?.stopPropagation?.();
    const bubble = event.currentTarget.closest(".voiceBubble");
    const speeds = [1, 1.5, 2];
    const cur = Number(bubble.dataset.rate || 1);
    const next = speeds[(speeds.indexOf(cur) + 1) % speeds.length] || 1;
    bubble.dataset.rate = String(next);
    event.currentTarget.textContent = next + "x";
    const audio = bubble.querySelector(".voicePlay")?.audio;
    if (audio) audio.playbackRate = next;
  };
  function resumeVoice137(snap) {
    if (!snap) return;
    requestAnimationFrame(async () => {
      const safe = window.CSS?.escape ? CSS.escape(snap.ref) : String(snap.ref).replace(/"/g, "\\\"");
      const btn = document.querySelector(`.voiceBubble[data-ref="${safe}"] .voicePlay`);
      if (!btn) return;
      const url = await hydrateFile(snap.ref);
      if (!url) return;
      const audio = new Audio(url);
      audio.currentTime = Math.max(0, snap.time || 0);
      audio.playbackRate = snap.rate || 1;
      btn.audio = audio;
      btn.textContent = "⏸";
      const bubble = btn.closest(".voiceBubble");
      bubble?.classList.add("playing");
      nv137.activeVoice = { ref:snap.ref, audio, button:btn, bubble };
      audio.onended = () => { btn.textContent = "▶"; bubble?.classList.remove("playing"); stopVoiceTick137(); nv137.activeVoice = null; };
      startVoiceTick137();
      audio.play().catch(() => {});
    });
  }
  window.snapshotVoice137 = snapshotVoice137;

  function mediaItems137() {
    const items = [];
    for (const m of S.messages?.[S.active] || []) {
      const a = m.decryptedAttachment || m.attachment;
      if (!a || !String(a.type || "").startsWith("image/")) continue;
      const ref = attachmentRef(a.url || a.id);
      items.push({ ref, name:a.name || "image", size:a.size || 0, messageId:m.id, url:fileUrl(a.url || a.id) || "" });
    }
    return items;
  }
  async function openMediaIndex137(index) {
    const items = nv137.media.items;
    if (!items.length) return;
    nv137.media.index = (index + items.length) % items.length;
    const item = items[nv137.media.index];
    if (!item.url) item.url = await hydrateFile(item.ref);
    if (!item.url) return toast("Фото ещё не загружено.");
    nv137.media.zoom = 1; nv137.media.x = 0; nv137.media.y = 0;
    const html = `<div class="mediaViewer137" id="mediaViewer137"><div class="mediaTop"><b>${h(item.name)}</b><span>${fmt(item.size || 0)} · ${nv137.media.index + 1}/${items.length}</span><button onclick="downloadAttachment('${h(item.ref)}','${inlineArg(item.name)}')">Скачать</button><button onclick="closeMediaViewer137()">×</button></div><button class="mediaNav prev" onclick="mediaViewerPrev137()">‹</button><img id="mediaImage137" src="${h(item.url)}" alt="${h(item.name)}" draggable="false"><button class="mediaNav next" onclick="mediaViewerNext137()">›</button><div class="mediaTools"><button onclick="mediaZoom137(1.18)">＋</button><button onclick="mediaZoom137(.85)">－</button><button onclick="mediaReset137()">100%</button></div></div>`;
    let host = document.getElementById("mediaViewer137");
    if (host) host.outerHTML = html; else document.body.insertAdjacentHTML("beforeend", html);
    bindMediaViewer137();
  }
  function bindMediaViewer137() {
    const root = document.getElementById("mediaViewer137");
    const img = document.getElementById("mediaImage137");
    if (!root || !img) return;
    function draw(){ img.style.transform = `translate(${nv137.media.x}px,${nv137.media.y}px) scale(${nv137.media.zoom})`; }
    root.onwheel = (e) => { e.preventDefault(); mediaZoom137(e.deltaY < 0 ? 1.12 : .88); };
    img.onpointerdown = (e) => { nv137.media.drag = { sx:e.clientX - nv137.media.x, sy:e.clientY - nv137.media.y }; img.setPointerCapture(e.pointerId); img.classList.add("dragging"); };
    img.onpointermove = (e) => { if (!nv137.media.drag) return; nv137.media.x = e.clientX - nv137.media.drag.sx; nv137.media.y = e.clientY - nv137.media.drag.sy; draw(); };
    img.onpointerup = () => { nv137.media.drag = null; img.classList.remove("dragging"); };
    draw();
  }
  window.openMediaViewerByRef137 = async function nv137OpenMediaViewerByRef(ref, encodedName) {
    nv137.media.items = mediaItems137();
    let idx = nv137.media.items.findIndex((item) => item.ref === ref);
    if (idx < 0) { nv137.media.items.push({ ref, name:decodeURIComponent(encodedName || "image"), size:0, url:fileUrl(ref) || "" }); idx = nv137.media.items.length - 1; }
    await openMediaIndex137(idx);
  };
  window.openMediaViewer = async function nv137OpenMediaViewer(file) {
    const ref = attachmentRef(file?.url || file?.id || file);
    return openMediaViewerByRef137(ref, inlineArg(file?.name || "image"));
  };
  window.openMediaViewerByUrl = async function nv137OpenMediaViewerByUrl(url, metadata = {}) {
    nv137.media.items = [{ ref:url, url, name:metadata.name || "image", size:metadata.size || 0 }];
    await openMediaIndex137(0);
  };
  window.openMediaViewerByMessage = async function nv137OpenMediaViewerByMessage(messageId) {
    const m = findMsg(messageId); const a = m?.decryptedAttachment || m?.attachment; if (!a) return toast("В сообщении нет фото."); return openMediaViewer(a);
  };
  window.mediaViewerNext137 = () => openMediaIndex137(nv137.media.index + 1);
  window.mediaViewerPrev137 = () => openMediaIndex137(nv137.media.index - 1);
  window.mediaZoom137 = (factor) => { nv137.media.zoom = Math.max(.15, Math.min(8, nv137.media.zoom * factor)); bindMediaViewer137(); };
  window.mediaReset137 = () => { nv137.media.zoom = 1; nv137.media.x = 0; nv137.media.y = 0; bindMediaViewer137(); };
  window.closeMediaViewer137 = () => document.getElementById("mediaViewer137")?.remove();
  document.addEventListener("keydown", (event) => { if (!document.getElementById("mediaViewer137")) return; if (event.key === "Escape") closeMediaViewer137(); if (event.key === "ArrowRight") mediaViewerNext137(); if (event.key === "ArrowLeft") mediaViewerPrev137(); if (event.key === "+" || event.key === "=") mediaZoom137(1.18); if (event.key === "-") mediaZoom137(.85); if (event.key === "0") mediaReset137(); });

  const baseProfilePage137 = profilePage;
  window.profilePage = profilePage = function nv137ProfilePage() {
    const html = String(baseProfilePage137() || "");
    return html.replace('onclick="changeBanner()">Загрузить баннер</button>', 'onclick="changeBanner()">Загрузить баннер</button><button class="btn ghost" onclick="deleteBanner137()">Удалить баннер</button>');
  };
  window.deleteBanner137 = async function nv137DeleteBanner() {
    try {
      const response = await api("/me", { method:"PUT", body:JSON.stringify({ banner:"" }) });
      S.user = response.user || { ...S.user, banner:"" };
      delete S.user._bannerPreviewUrl;
      toast("Баннер удалён");
      render();
    } catch (error) { toast("Баннер не удалён: " + (error.message || error)); }
  };

  const baseBind137 = bind;
  window.bind = bind = function nv137Bind() {
    baseBind137();
    const pc = document.getElementById("profileColor");
    if (pc && !pc.dataset.nv137) {
      pc.dataset.nv137 = "1";
      pc.addEventListener("input", () => { if (S.user) S.user.profileColor = pc.value; document.documentElement.style.setProperty("--profileColor", pc.value); const hero = document.querySelector(".profileHero"); if (hero) hero.style.setProperty("--profileColor", pc.value); renderSideOnly("profile-color"); });
    }
  };

  const baseSettingsPanel137 = settingsPanel;
  window.settingsPanel = settingsPanel = function nv137SettingsPanel() {
    return String(baseSettingsPanel137() || "").replace(/NightVault 1\.2\.0 Mega Release/g, "NightVault 1.3.9 Messenger Features Update").replace(/Mega Release:/g, "Messenger Features Update:").replace(/1\.3\.[0-6]/g, "1.3.9");
  };
  const baseSettingsPage137 = settingsPage;
  window.settingsPage = settingsPage = function nv137SettingsPage() {
    return String(baseSettingsPage137() || "").replace(/NightVault 1\.2\.0 Mega Release/g, "NightVault 1.3.9 Messenger Features Update").replace(/Mega Release:/g, "Messenger Features Update:").replace(/1\.3\.[0-6]/g, "1.3.9");
  };
})();

/* NightVault 1.3.9 — server admin events from Admin Pro */
(function nv138ClientAdminEvents(){
  function showAdminBanner138(text, kind = "info") {
    let bar = document.getElementById("nv138ServerBanner");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "nv138ServerBanner";
      bar.className = "nv138ServerBanner";
      document.body.appendChild(bar);
    }
    bar.dataset.kind = kind;
    bar.innerHTML = `<b>Администратор сервера</b><span>${h(text || "Событие сервера")}</span><button onclick="this.closest('#nv138ServerBanner')?.remove()">×</button>`;
    try { toast(String(text || "Событие сервера")); } catch {}
  }
  const baseConnect138 = connect;
  window.connect = connect = async function nv138ConnectAdminEvents() {
    const result = await baseConnect138();
    if (sock && !sock.__nv138AdminEvents) {
      sock.__nv138AdminEvents = true;
      const previous = sock.onmessage;
      sock.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || "{}");
          if (payload.type === "admin:broadcast") return showAdminBanner138(payload.text, payload.broadcastType || "info");
          if (payload.type === "server:maintenance") return showAdminBanner138(payload.text || payload.maintenance?.message || "Сервер на обслуживании", "maintenance");
          if (payload.type === "server:update_available") return showAdminBanner138(payload.text || "Доступно обновление NightVault", "update");
        } catch {}
        return previous?.(event);
      };
    }
    return result;
  };
})();
function closest() { return null; }

/* NightVault 1.3.9 — Messenger Features Update: forward, saved messages, media history, folders, mentions, notifications, paste/upload UX */
(function nv139MessengerFeaturesLayer(){
  const VERSION = "1.3.9";
  const SAVED_CHAT_ID = "nv_saved_local";
  window.NV139_FEATURES = true;
  function jsonLoad(key, fallback) { try { return JSON.parse(localStorage[key] || ""); } catch { return fallback; } }
  function jsonSave(key, value) { localStorage[key] = JSON.stringify(value); }
  window.nv139CopyToClipboard = async function nv139CopyToClipboard(encodedText) { const text = decodeURIComponent(String(encodedText || '')); await navigator.clipboard?.writeText(text).catch(()=>{}); toast('Скопировано'); };
  function messagePayloadText(m) { return String(m?.decryptedText || m?.text || m?.replyPreview?.text || "").replace(/^🔐\s*Зашифрованное сообщение$/i, ""); }
  function messagePayloadAttachment(m) { return m?.decryptedAttachment || m?.attachment || null; }
  function allLocalSaved() { return jsonLoad("nv139SavedMessages", []); }
  function saveLocalSaved(list) { jsonSave("nv139SavedMessages", list.slice(-500)); }
  function saveNotification139(item) { const list = jsonLoad("nv139Notifications", []); list.push({ id:"n"+Date.now()+Math.random().toString(16).slice(2), read:false, createdAt:Date.now(), ...item }); jsonSave("nv139Notifications", list.slice(-200)); }
  function currentMentionNames139() { const c = currentChat(); return (c?.members || []).filter(Boolean).sort(); }
  function selectedMessages139() { return [...(S.selected || new Set())].map(findMsg).filter(Boolean); }
  function chatLabel139(c) { return c?.type === "private" ? (c.other?.displayName || c.other?.username || "Личный чат") : (c?.title || (c?.type === "saved" ? "Избранное" : "Чат")); }
  function hasBlocked139(username) { return jsonLoad("nv139BlockedUsers", []).includes(String(username || "").toLowerCase()); }
  function setBlocked139(username, blocked) { const u = String(username || "").toLowerCase(); let list = jsonLoad("nv139BlockedUsers", []).filter((x)=>x!==u); if (blocked && u) list.push(u); jsonSave("nv139BlockedUsers", list); }
  function ensureSavedPseudoChat139(list) {
    const saved = allLocalSaved();
    const exists = list.some((c)=>c.id === SAVED_CHAT_ID || c.type === "saved");
    if (!exists && (S.folder === "all" || S.folder === "saved")) {
      list.push({ id:SAVED_CHAT_ID, type:"saved", title:"Избранное", last:saved.at(-1) ? { text:saved.at(-1).preview || "Сохранённое", createdAt:saved.at(-1).createdAt } : null, unread:0, createdAt:0, members:[S.user?.username].filter(Boolean) });
    }
    return list;
  }

  const baseFilteredChats139 = filteredChats;
  window.filteredChats = filteredChats = function nv139FilteredChats() {
    return ensureSavedPseudoChat139(baseFilteredChats139());
  };

  const baseOpenChat139 = openChat;
  window.openChat = openChat = async function nv139OpenChat(id) {
    if (id === SAVED_CHAT_ID) { S.active = SAVED_CHAT_ID; S.selected.clear(); S.editId = null; render(); return; }
    return baseOpenChat139(id);
  };

  const baseChatRow139 = chatRow;
  window.chatRow = chatRow = function nv139ChatRow(c) {
    const html = String(baseChatRow139(c) || "");
    const draft = getDraft(c.id);
    const typing = S.typing?.[c.id];
    const mute = c.muted?.[S.user?.username] || jsonLoad("nv139MutedChats", []).includes(c.id);
    return html
      .replace('class="row ', `class="row nv139ChatRow ${mute ? 'mutedChat ' : ''}`)
      .replace('<div class="small ellipsis">', `<div class="rowBadges">${mute ? '<span title="Без уведомлений">🔕</span>' : ''}${typing ? '<span class="typingMini">печатает…</span>' : ''}${draft ? '<span class="draftMini">черновик</span>' : ''}</div><div class="small ellipsis">`);
  };

  window.nv139SavedMessagesPage = function nv139SavedMessagesPage() {
    const saved = allLocalSaved().slice().reverse();
    const groups = ["Все","Текст","Медиа","Файлы","Ссылки","Голосовые","Заметки"];
    return `<div class="sidePad nv139SavedPage"><div class="contactsHero"><div><h1>Избранное 2.0</h1><p class="muted">Личное хранилище сообщений, файлов, голосовых, ссылок и заметок.</p></div><button class="btn ghost" onclick="nv139ClearSaved()">Очистить</button></div><div class="filterRow">${groups.map(g=>`<button class="chip">${h(g)}</button>`).join("")}</div><div class="nv139SavedList">${saved.map((item)=>`<article class="fileCard nv139SavedItem"><b>${h(item.preview || item.type || 'Сохранено')}</b><small>${h(item.from || '')} · ${date(item.createdAt)} ${time(item.createdAt)}</small><div class="buttonRow compact"><button class="btn ghost" onclick="nv139OpenOriginal('${h(item.chatId)}','${h(item.messageId)}')">Открыть оригинал</button><button class="btn ghost" onclick="nv139ForwardSaved('${h(item.id)}')">Переслать</button></div></article>`).join("") || '<div class="empty">Пока ничего не сохранено. Используй ПКМ по сообщению → Сохранить.</div>'}</div></div>`;
  };
  window.nv139ClearSaved = function nv139ClearSaved(){ saveLocalSaved([]); toast("Избранное очищено"); render(); };
  window.nv139OpenOriginal = function nv139OpenOriginal(chatId, messageId){ if(!chatId || chatId===SAVED_CHAT_ID) return; S.tab='chats'; openChat(chatId).then(()=>setTimeout(()=>nv139JumpToMessage(messageId), 300)); };
  window.nv139ForwardSaved = function nv139ForwardSaved(id){ const item=allLocalSaved().find((x)=>x.id===id); if(!item) return; nv139ChooseForwardTarget([{ text:item.text || item.preview || '', attachment:item.attachment || null, from:item.from || S.user?.username || '', id:item.messageId || id }]); };

  const baseRenderCenter139 = renderCenter;
  window.renderCenter = renderCenter = function nv139RenderCenter() {
    if (S.active === SAVED_CHAT_ID || (S.folder === "saved" && !currentChat())) return nv139SavedMessagesPage();
    return baseRenderCenter139();
  };

  const baseSelectionBar139 = selectionBar;
  window.selectionBar = selectionBar = function nv139SelectionBar() {
    return `<div class="selectedBar nv139SelectionBar"><button class="iconBtn" onclick="clearSelection()">×</button><b>Выбрано: ${S.selected.size}</b><span class=spacer></span><button class=iconBtn onclick="nv139CopySelected()">Копировать</button><button class=iconBtn onclick="nv139SaveSelected()">Сохранить</button><button class=iconBtn onclick="nv139ForwardSelected()">Переслать</button><button class=iconBtn onclick="deleteSelected(0)">Удалить у себя</button><button class=iconBtn onclick="deleteSelected(1)">Удалить у всех</button></div>`;
  };
  window.nv139CopySelected = async function nv139CopySelected(){ const text=selectedMessages139().map((m)=>messagePayloadText(m) || m.attachment?.name || '').filter(Boolean).join("\n"); await navigator.clipboard?.writeText(text).catch(()=>{}); toast("Скопировано: " + S.selected.size); };
  window.nv139SaveSelected = function nv139SaveSelected(){ const list=allLocalSaved(); for(const m of selectedMessages139()) nv139PushSaved(m, list); saveLocalSaved(list); toast("Сохранено в Избранное: " + S.selected.size); S.selected.clear(); render(); };
  window.nv139ForwardSelected = function nv139ForwardSelected(){ const msgs=selectedMessages139(); if(!msgs.length) return toast("Нет выбранных сообщений"); nv139ChooseForwardTarget(msgs); };

  window.nv139PushSaved = function nv139PushSaved(m, list = allLocalSaved()) {
    const a = messagePayloadAttachment(m);
    list.push({ id:"s"+Date.now()+Math.random().toString(16).slice(2), messageId:m.id, chatId:m.chatId, from:m.from, text:messagePayloadText(m), attachment:a, preview:messagePayloadText(m) || a?.name || "Сообщение", type:a?.type || "text", createdAt:Date.now() });
    saveLocalSaved(list);
  };
  window.nv139SaveMessage = function nv139SaveMessage(id){ const m=findMsg(id); if(!m) return; nv139PushSaved(m); toast("Сохранено в Избранное"); document.querySelector(".ctx")?.remove(); renderChatListOnly(); };

  async function forwardOne139(targetChatId, m) {
    const a = messagePayloadAttachment(m);
    const text = messagePayloadText(m);
    const label = m.from && m.from !== S.user?.username ? `Переслано от @${m.from}\n` : "";
    const payload = await buildOutgoingMessagePayload(targetChatId, label + text, a || null);
    const response = await api("/chats/" + encodeURIComponent(targetChatId) + "/messages", { method:"POST", body:JSON.stringify({ ...payload, forwardedFrom:m.from || null, originalMessageId:m.id || null, ttl:0 }) });
    await decryptMessage(response.message);
    S.messages[targetChatId] = S.messages[targetChatId] || [];
    if (!S.messages[targetChatId].some((x)=>x.id===response.message.id)) S.messages[targetChatId].push(response.message);
  }
  window.nv139ForwardMessage = function nv139ForwardMessage(id){ const m=findMsg(id); if(!m) return toast("Сообщение не найдено"); document.querySelector(".ctx")?.remove(); nv139ChooseForwardTarget([m]); };
  window.nv139ChooseForwardTarget = function nv139ChooseForwardTarget(messages) {
    const chats = S.chats.filter((c)=>c.id!==S.active && c.id!==SAVED_CHAT_ID);
    modal(`<div class="nv139Forward"><h2>Переслать</h2><p class="muted">Выбрано сообщений: ${messages.length}. Сообщение будет заново зашифровано под выбранный чат.</p><input id="forwardSearch139" class="field" placeholder="Поиск по чатам"><div id="forwardList139" class="nv139ForwardList">${chats.map((c)=>`<button class="fileCard" onclick="nv139DoForward('${h(c.id)}')"><b>${h(chatLabel139(c))}</b><small>${h(c.type)}</small></button>`).join("") || '<div class="empty">Нет других чатов.</div>'}</div></div>`);
    window.__nv139ForwardMessages = messages;
    const search = document.getElementById("forwardSearch139");
    if (search) search.oninput = () => { const q=search.value.toLowerCase(); document.querySelectorAll("#forwardList139 .fileCard").forEach((el)=>{ el.style.display = el.textContent.toLowerCase().includes(q) ? "" : "none"; }); };
  };
  window.nv139DoForward = async function nv139DoForward(targetChatId) {
    try { const msgs = window.__nv139ForwardMessages || []; for (const m of msgs) await forwardOne139(targetChatId, m); closeModal(); S.selected.clear(); toast("Переслано: " + msgs.length); await loadChats(false); render(); } catch (error) { toast("Не переслано: " + (error.message || error)); }
  };

  const baseCtx139 = ctx;
  window.ctx = ctx = function nv139Ctx(e, id) {
    baseCtx139(e, id);
    const d = document.querySelector(".ctx");
    if (!d) return;
    d.insertAdjacentHTML("beforeend", `<button onclick="nv139ForwardMessage('${h(id)}')">Переслать</button><button onclick="nv139SaveMessage('${h(id)}')">Сохранить в Избранное</button><button onclick="nv139ReportMessage('${h(id)}')">Пожаловаться</button>`);
  };

  window.nv139ReportMessage = function nv139ReportMessage(id) {
    const m = findMsg(id); if(!m) return;
    modal(`<h2>Жалоба 2.0</h2><p class="muted">Сообщение от @${h(m.from)} будет приложено к жалобе.</p>${["спам","оскорбления","мошенничество","опасный контент","другое"].map((r)=>`<label class="fileCard"><input class="nv139ReportReason" type="checkbox" value="${h(r)}"> ${h(r)}</label>`).join("")}<textarea id="nv139ReportComment" class="field" rows="3" placeholder="Комментарий"></textarea><button class="btn" onclick="nv139SendReport('${h(id)}')">Отправить</button>`);
  };
  window.nv139SendReport = async function nv139SendReport(id){ const m=findMsg(id); const reasons=[...document.querySelectorAll('.nv139ReportReason:checked')].map((x)=>x.value); try { await api('/reputation/' + encodeURIComponent(m.from), { method:'POST', body:JSON.stringify({ type:'report', reasons: reasons.length ? reasons : ['другое'], messageId:id, comment:document.getElementById('nv139ReportComment')?.value || '' }) }); closeModal(); toast('Жалоба отправлена'); } catch(e){ toast('Жалоба не отправлена: '+(e.message||e)); } };

  function mediaGroups139() {
    const arr = S.messages?.[S.active] || [];
    const media=[], files=[], links=[], voices=[];
    for (const m of arr) {
      const a=messagePayloadAttachment(m); const text=messagePayloadText(m);
      if (a) {
        const t=String(a.type||"");
        if (t.startsWith("image/") || t.startsWith("video/")) media.push({m,a});
        else if (t.startsWith("audio/") || a.voice) voices.push({m,a});
        else files.push({m,a});
      }
      const match = text.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi);
      if (match) for (const url of match.slice(0,4)) links.push({m,url});
    }
    return { media, files, links, voices };
  }
  window.nv139MediaHistory = function nv139MediaHistory(kind="media") {
    const g=mediaGroups139(); const items=g[kind]||[];
    if(kind==="media") return `<div class="nv139MediaGrid">${items.map(({m,a})=>`<button onclick="openMediaViewerByMessage('${h(m.id)}')"><img src="${h(fileUrl(a.url||a.id)||'')}" alt="${h(a.name||'media')}"><small>${date(m.createdAt)}</small></button>`).join("") || '<p class="muted">Медиа пока нет.</p>'}</div>`;
    if(kind==="links") return items.map(({m,url})=>`<button class="fileCard" onclick="nv139CopyToClipboard('${inlineArg(url)}')">🔗 <span>${h(url)}<small>${date(m.createdAt)} ${time(m.createdAt)}</small></span></button>`).join("") || '<p class="muted">Ссылок пока нет.</p>';
    return items.map(({m,a})=>`<button class="fileCard" onclick="nv139OpenOriginal('${h(m.chatId)}','${h(m.id)}')">${kind==='voices'?'🎙':'📎'} <span>${h(a.name||'file')}<small>${fmt(a.size||0)} · ${date(m.createdAt)} ${time(m.createdAt)}</small></span></button>`).join("") || '<p class="muted">Пока пусто.</p>';
  };
  const baseRenderSide139 = renderSide;
  window.renderSide = renderSide = function nv139RenderSide() {
    const base = String(baseRenderSide139() || "");
    if (!currentChat()) return base;
    return base.replace('</div>', `<div class="nv139SideTabs"><button onclick="nv139SideTab('media')">Медиа</button><button onclick="nv139SideTab('files')">Файлы</button><button onclick="nv139SideTab('links')">Ссылки</button><button onclick="nv139SideTab('voices')">Голосовые</button></div><div id="nv139SideContent">${nv139MediaHistory(localStorage.nv139SideTab || 'media')}</div></div>`);
  };
  window.nv139SideTab = function nv139SideTab(tab){ localStorage.nv139SideTab=tab; const el=document.getElementById('nv139SideContent'); if(el) el.innerHTML=nv139MediaHistory(tab); };

  const baseShowChatMenu139 = showChatMenu;
  window.showChatMenu = showChatMenu = function nv139ShowChatMenu(e) {
    baseShowChatMenu139(e);
    const d=document.querySelector('.ctx'); if(!d) return;
    d.insertAdjacentHTML('beforeend', `<button onclick="nv139PinnedList()">Список закрепов</button><button onclick="nv139OpenNotificationCenter()">Центр уведомлений</button><button onclick="nv139MuteMenu()">Не беспокоить</button>`);
  };
  window.nv139PinnedList = function nv139PinnedList(){ const c=currentChat(); const pins=(c?.pinned||[]).map(findMsg).filter(Boolean); modal(`<h2>Закреплённые сообщения</h2>${pins.map((m)=>`<button class="fileCard" onclick="closeModal();nv139JumpToMessage('${h(m.id)}')">📌 ${h(messagePayloadText(m)||m.attachment?.name||'сообщение')}</button>`).join("") || '<p class="muted">Закрепов нет.</p>'}`); };
  window.nv139JumpToMessage = function nv139JumpToMessage(id){ const el=[...document.querySelectorAll('.msg')].find((node)=>node.getAttribute('oncontextmenu')?.includes(id)); el?.scrollIntoView({ block:'center', behavior:'smooth' }); el?.classList.add('nv139Flash'); setTimeout(()=>el?.classList.remove('nv139Flash'),2200); };

  window.nv139NotificationCenter = function nv139NotificationCenter(){ const list=jsonLoad('nv139Notifications', []).slice().reverse(); return `<h2>Центр уведомлений</h2><p class="muted">Сообщения, заявки, упоминания, объявления сервера и ошибки sync.</p>${list.map((n)=>`<div class="fileCard"><b>${h(n.title||'NightVault')}</b><span>${h(n.text||'')}</span><small>${date(n.createdAt)} ${time(n.createdAt)}</small></div>`).join("") || '<p class="muted">Пока пусто.</p>'}<button class="btn ghost" onclick="localStorage.nv139Notifications='[]';closeModal();toast('Уведомления очищены')">Очистить</button>`; };
  window.nv139OpenNotificationCenter = function nv139OpenNotificationCenter(){ modal(nv139NotificationCenter()); };
  window.nv139MuteMenu = function nv139MuteMenu(){ const c=currentChat(); if(!c) return; modal(`<h2>Не беспокоить</h2><p class="muted">Mute / DND для этого чата.</p>${[['1 час',3600000],['8 часов',28800000],['До завтра',86400000],['Навсегда',0]].map(([label,ms])=>`<button class="fileCard" onclick="nv139MuteChat('${h(c.id)}',${ms})">🔕 ${h(label)}</button>`).join("")}<button class="btn ghost" onclick="nv139UnmuteChat('${h(c.id)}')">Включить уведомления</button>`); };
  window.nv139MuteChat=function nv139MuteChat(id,ms){ let map=jsonLoad('nv139MutedUntil',{}); map[id]=ms?Date.now()+ms:9999999999999; jsonSave('nv139MutedUntil',map); closeModal(); toast('Чат заглушён'); renderChatListOnly(); };
  window.nv139UnmuteChat=function nv139UnmuteChat(id){ let map=jsonLoad('nv139MutedUntil',{}); delete map[id]; jsonSave('nv139MutedUntil',map); closeModal(); toast('Уведомления включены'); renderChatListOnly(); };

  function nv139MentionDropdown(textarea) {
    const value = textarea.value.slice(0, textarea.selectionStart || 0);
    const match = value.match(/(?:^|\s)@([\wа-яё-]{0,24})$/i);
    let box=document.getElementById('nv139MentionDropdown');
    if(!match){ box?.remove(); return; }
    const q=match[1].toLowerCase();
    const names=[...new Set([...currentMentionNames139(), 'all', 'admins'])].filter((x)=>x.toLowerCase().includes(q)).slice(0,8);
    if(!names.length){ box?.remove(); return; }
    if(!box){ box=document.createElement('div'); box.id='nv139MentionDropdown'; box.className='nv139MentionDropdown'; document.body.appendChild(box); }
    box.innerHTML=names.map((name)=>`<button onclick="nv139InsertMention('${h(name)}')">@${h(name)}</button>`).join('');
    const r=textarea.getBoundingClientRect(); box.style.left=r.left+'px'; box.style.bottom=(window.innerHeight-r.top+8)+'px';
  }
  window.nv139MentionDropdown = nv139MentionDropdown;
  window.nv139InsertMention=function nv139InsertMention(name){ const t=document.getElementById('txt'); if(!t) return; const start=t.selectionStart||0; const pre=t.value.slice(0,start).replace(/@([\wа-яё-]*)$/i, '@'+name+' '); t.value=pre+t.value.slice(start); t.focus(); t.selectionStart=t.selectionEnd=pre.length; saveDraft(); document.getElementById('nv139MentionDropdown')?.remove(); };

  const baseBind139 = bind;
  window.bind = bind = function nv139Bind() {
    baseBind139();
    const txt=document.getElementById('txt');
    if(txt && !txt.dataset.nv139){
      txt.dataset.nv139='1';
      txt.addEventListener('input',()=>nv139MentionDropdown(txt));
      txt.addEventListener('paste', nv139PasteHandler);
    }
  };
  window.nv139PasteHandler = async function nv139PasteHandler(event){
    const items=[...(event.clipboardData?.items||[])];
    const files=items.map((item)=> item.kind==='file' ? item.getAsFile() : null).filter(Boolean);
    if(!files.length) return;
    event.preventDefault();
    try { for (const f of files) { const uploaded=await uploadBrowserFile(f); await sendMsg(uploaded); } toast('Вставлено из буфера: '+files.length); } catch(e){ toast('Буфер не отправлен: '+(e.message||e)); }
  };

  const baseDropFiles139 = dropFiles;
  window.dropFiles = dropFiles = async function nv139DropFiles(e) {
    e.preventDefault();
    const files=[...(e.dataTransfer?.files||[])];
    if(!files.length) return baseDropFiles139(e);
    modal(`<h2>Отправить файлы</h2><p class="muted">Файлов: ${files.length}. Можно добавить подпись первым сообщением.</p><textarea id="nv139FileCaption" class="field" rows="3" placeholder="Подпись"></textarea><div class="nv139UploadPreview">${files.map((f)=>`<div class="fileCard">📎 ${h(f.name)} <small>${fmt(f.size)}</small></div>`).join('')}</div><button class="btn" onclick="nv139ConfirmDroppedFiles()">Отправить</button>`);
    window.__nv139DroppedFiles=files;
  };
  window.nv139ConfirmDroppedFiles = async function nv139ConfirmDroppedFiles(){ const files=window.__nv139DroppedFiles||[]; const caption=document.getElementById('nv139FileCaption')?.value||''; closeModal(); try{ if(caption.trim()) { const old=document.getElementById('txt'); if(old) old.value=caption; await sendMsg(); } for(const f of files){ const uploaded=await uploadBrowserFile(f); await sendMsg(uploaded); } toast('Файлы отправлены: '+files.length); } catch(e){ toast('Не отправлено: '+(e.message||e)); } };

  const baseContactsPage139 = contactsPage;
  window.contactsPage = contactsPage = function nv139ContactsPage(){ return String(baseContactsPage139()||'').replace('1.0.9: отдельная система заявок, избранных, заметок и приватности “только контакты”.', 'Messenger Features 1.3.9: заявки, избранные, блокировки, уведомления и быстрый поиск.'); };

  const baseShowProfile139 = showProfile;
  window.showProfile = showProfile = function nv139UserProfile2(id) {
    const c = S.chats.find((x)=>x.id===id);
    if(!c || c.type !== 'private') return baseShowProfile139(id);
    const u=c.other||{};
    const blocked=hasBlocked139(u.username);
    modal(`<div class="profileHero" style="${cssImageUrl(u.banner)}">${av(u,'bigAvatar')}</div><h2>${h(u.displayName||u.username)}</h2><div class="muted">@${h(u.username)}</div><p>${h(u.bio||'Нет описания')}</p><div class="settingCards"><div class="settingCard"><b>Общие группы</b><span>${S.chats.filter((x)=>['group','channel'].includes(x.type)&&(x.members||[]).includes(u.username)).length}</span></div><div class="settingCard"><b>Статус</b><span>${h(statusLine(u))}</span></div></div><div class="buttonRow"><button class="btn" onclick="closeModal();openChat('${h(c.id)}')">Написать</button><button class="btn ghost" onclick="nv139CopyToClipboard('${inlineArg('@' + (u.username || ''))}')">Скопировать username</button><button class="btn ghost" onclick="repMenu('${h(u.username)}','report')">Пожаловаться</button><button class="btn danger" onclick="nv139ToggleBlock('${h(u.username)}')">${blocked?'Разблокировать':'Заблокировать'}</button></div>`);
  };
  window.nv139ToggleBlock = function nv139ToggleBlock(username){ const next=!hasBlocked139(username); setBlocked139(username,next); try{ if(next) api('/block/'+encodeURIComponent(username),{method:'POST',body:'{}'}).catch(()=>{}); }catch{} closeModal(); toast(next?'Пользователь заблокирован':'Пользователь разблокирован'); };

  const baseConnect139 = connect;
  window.connect = connect = async function nv139Connect() {
    const result = await baseConnect139();
    if(sock && !sock.__nv139Events){
      sock.__nv139Events=true;
      const previous=sock.onmessage;
      sock.onmessage=(event)=>{
        try{
          const payload=JSON.parse(event.data||'{}');
          if(payload.type==='message' && payload.message){
            const text=payload.message.text||payload.message.attachment?.name||'Новое сообщение';
            saveNotification139({title:'Новое сообщение', text, chatId:payload.message.chatId});
            if((payload.message.mentions||[]).includes(S.user?.username) || /@(all|admins)/i.test(text)) { toast('Вас упомянули в чате'); saveNotification139({title:'Упоминание', text, chatId:payload.message.chatId}); }
          }
          if(payload.type==='contacts_update') saveNotification139({title:'Контакты', text:'Обновление заявок и контактов'});
        }catch{}
        return previous?.(event);
      };
    }
    return result;
  };

  const baseSettingsPanel139 = settingsPanel;
  window.settingsPanel = settingsPanel = function nv139SettingsPanel(){
    const section = localStorage.nvSettingsSection || 'overview';
    if(section === 'notifications') return `<section class=settingsPanel><h2>Уведомления 2.0</h2><p class=muted>Центр уведомлений, звуки, preview, mute/DND и упоминания.</p><label class=toggleRow><input id=notify type=checkbox ${S.settings.notify !== false ? 'checked' : ''}> <span>Показывать системные уведомления</span></label><label class=toggleRow><input id=messageSound type=checkbox ${localStorage.nvMessageSound !== '0' ? 'checked' : ''}> <span>Звук нового сообщения</span></label><label class=toggleRow><input id=toastPreview type=checkbox ${localStorage.nvToastPreview !== '0' ? 'checked' : ''}> <span>Показывать preview текста</span></label><div class=buttonRow><button class=btn onclick="nv139OpenNotificationCenter()">Открыть центр уведомлений</button><button class='btn ghost' onclick="saveSettings()">Сохранить</button></div></section>`;
    return String(baseSettingsPanel139()||'').replace(/NightVault 1\.3\.\d+/g,'NightVault 1.3.9').replace(/Admin Pro & Server Control Update/g,'Messenger Features Update');
  };
  const baseSettingsPage139 = settingsPage;
  window.settingsPage = settingsPage = function nv139SettingsPage(){ return String(baseSettingsPage139()||'').replace(/1\.3\.\d+/g,'1.3.9').replace(/Admin Pro & Server Control Update/g,'Messenger Features Update'); };
})();
