"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  Notification,
  session,
  shell,
  safeStorage,
  Tray,
  screen,
} = require("electron");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { runRealAdminTest } = require("../server/services/admin-tests");
const { buildDebugReport } = require("../server/lib/debug-report");
const { collectReadinessReport } = require("../server/services/readiness");

let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch {}

Menu.setApplicationMenu(null);
if (process.platform === "win32")
  app.setAppUserModelId("com.nightvault.messenger");

const isAdminMode = process.argv.includes("--admin") || process.env.NIGHTVAULT_ADMIN === "1";

const rawClientProfileArg = (() => {
  const arg = process.argv.find((item) => /^--profile=/i.test(item));
  return arg ? arg.split("=").slice(1).join("=") : "";
})();
function sanitizeProfileId(value) {
  const text = String(value || "").trim().replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-").slice(0, 48);
  return text || "default";
}
const clientProfileId = sanitizeProfileId(process.env.NIGHTVAULT_PROFILE_ID || rawClientProfileArg || (isAdminMode ? "admin" : "default"));
const originalUserDataPath = app.getPath("userData");
if (!isAdminMode) {
  app.setPath("userData", path.join(originalUserDataPath, "client-profiles", clientProfileId));
} else {
  app.setPath("userData", path.join(originalUserDataPath, "admin"));
}

const singleInstanceEnabled = process.env.NIGHTVAULT_SINGLE_INSTANCE === "1";
const singleInstanceLock = singleInstanceEnabled ? app.requestSingleInstanceLock() : true;
if (!singleInstanceLock) {
  app.quit();
}

let mainWindow;
let adminWindow;
let adminServerModule = null;
let adminServerUrl = "http://127.0.0.1:3000";
let adminServerStatus = { ok: false, mode: "idle", message: "Сервер ещё не запущен." };
let adminAuthenticated = false;
let tray = null;
let isQuitting = false;
let updateInfo = null;
let updateDownloaded = false;
let bundledServer = null;
let runtimeServerUrl = "http://127.0.0.1:3000";
let runtimeServerStatus = { mode: "pending", message: "Сервер ещё не проверен." };

const changelogPath = path.join(__dirname, "../assets/changelog.json");
const updateStatePath = () =>
  path.join(app.getPath("userData"), "update-state.json");
const authVaultPath = () =>
  path.join(app.getPath("userData"), "auth-vault.json");
const sharedE2eeVaultPath = () =>
  path.join(originalUserDataPath, "shared-e2ee-vault.json");
const windowPrefsPath = () =>
  path.join(app.getPath("userData"), "window-prefs.json");
const adminConfigPath = () =>
  path.join(app.getPath("userData"), "admin-config.json");

function readJsonSafe(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
  } catch {}
}

const adminLogBuffer = [];
function pushAdminLog(level, args) {
  const line = {
    id: crypto.randomBytes(6).toString("hex"),
    level,
    time: new Date().toISOString(),
    text: args.map((arg) => {
      if (typeof arg === "string") return arg;
      try { return JSON.stringify(arg); } catch { return String(arg); }
    }).join(" ").slice(0, 4000),
  };
  adminLogBuffer.push(line);
  if (adminLogBuffer.length > 1200) adminLogBuffer.shift();
  try { adminWindow?.webContents?.send("admin-log", line); } catch {}
}
function installAdminLogCapture() {
  if (console.__nightVaultAdminPatched) return;
  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      pushAdminLog(level, args);
      original(...args);
    };
  }
  console.__nightVaultAdminPatched = true;
}

function pbkdf2Base64Url(password, salt, iterations = 240000) {
  return crypto.pbkdf2Sync(String(password || ""), String(salt || ""), iterations, 32, "sha256").toString("base64url");
}
function createInitialAdminConfig() {
  const configured = String(process.env.NIGHTVAULT_ADMIN_PASSWORD || "");
  const generated = configured || crypto.randomBytes(18).toString("base64url");
  const salt = crypto.randomBytes(16).toString("base64url");
  const cfg = { username: "admin", iterations: 240000, salt, hash: pbkdf2Base64Url(generated, salt, 240000), createdAt: Date.now(), generated: !configured };
  if (!configured) {
    const passFile = path.join(app.getPath("userData"), "admin-first-login.txt");
    try {
      fs.mkdirSync(path.dirname(passFile), { recursive: true });
      fs.writeFileSync(passFile, `NightVault admin first-login password\nlogin: admin\npassword: ${generated}\nchange it after first login.\n`, { mode: 0o600 });
      console.warn(`[NightVault] Generated first admin password saved to: ${passFile}`);
    } catch {}
  }
  writeJsonSafe(adminConfigPath(), cfg);
  return cfg;
}
function readAdminConfig() {
  const saved = readJsonSafe(adminConfigPath(), null);
  if (saved?.username && saved?.salt && saved?.hash) return saved;
  return createInitialAdminConfig();
}
function verifyAdminCredentials(username, password) {
  const cfg = readAdminConfig();
  const expectedUser = String(cfg.username || "admin").trim().toLowerCase();
  const okUser = String(username || "").trim().toLowerCase() === expectedUser;
  const actualHash = pbkdf2Base64Url(password, cfg.salt, Number(cfg.iterations || 240000));
  const expected = Buffer.from(String(cfg.hash || ""));
  const actual = Buffer.from(String(actualHash || ""));
  if (!okUser) {
    pbkdf2Base64Url("dummy", cfg.salt, Number(cfg.iterations || 240000));
    return false;
  }
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
function changeAdminPassword(currentPassword, nextPassword) {
  if (!verifyAdminCredentials("admin", currentPassword)) throw new Error("Текущий пароль администратора неверен.");
  if (String(nextPassword || "").length < 10) throw new Error("Новый пароль должен быть не короче 10 символов.");
  const salt = crypto.randomBytes(16).toString("base64url");
  const cfg = { username: "admin", iterations: 240000, salt, hash: pbkdf2Base64Url(nextPassword, salt, 240000), changedAt: Date.now() };
  writeJsonSafe(adminConfigPath(), cfg);
  return { ok: true };
}

function createAdminWindow() {
  installAdminLogCapture();
  adminWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    title: "NightVault Server Admin",
    backgroundColor: "#06040d",
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "admin-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  const adminPath = path.join(__dirname, "admin.html");
  adminWindow.loadFile(adminPath);
  adminWindow.once("ready-to-show", () => adminWindow?.show());
  adminWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  adminWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = new URL(`file://${adminPath}`).pathname;
    let target = "";
    try { target = new URL(url).pathname; } catch {}
    if (target !== allowed) event.preventDefault();
  });
  adminWindow.on("closed", () => { adminWindow = null; });
}

async function startAdminServer() {
  installAdminLogCapture();
  process.env.NIGHTVAULT_DATA_DIR ||= path.join(app.getPath("userData"), "server");
  process.env.NIGHTVAULT_HOST = process.env.NIGHTVAULT_HOST || "0.0.0.0";
  process.env.NIGHTVAULT_PORT ||= "3000";
  const host = process.env.NIGHTVAULT_HOST;
  const preferredPort = Number(process.env.NIGHTVAULT_PORT) || 3000;
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  if (await probeNightVaultServer(probeHost, preferredPort)) {
    adminServerUrl = process.env.NIGHTVAULT_PUBLIC_URL || `http://${host}:${preferredPort}`;
    adminServerStatus = { ok: true, mode: "external", url: adminServerUrl, message: "Сервер NightVault уже запущен. Админ-панель подключена к нему." };
    pushAdminLog("info", [adminServerStatus.message]);
    return adminServerStatus;
  }
  adminServerModule ||= require("../server/server");
  if (adminServerModule.server.listening) {
    const address = adminServerModule.server.address();
    const port = typeof address === "object" && address ? address.port : preferredPort;
    adminServerUrl = process.env.NIGHTVAULT_PUBLIC_URL || `http://${host}:${port}`;
    adminServerStatus = { ok: true, mode: "embedded", url: adminServerUrl, message: host === "0.0.0.0" ? "Сервер уже работает и открыт для Radmin/LAN." : "Сервер уже работает внутри админ-приложения." };
    return adminServerStatus;
  }
  const port = adminServerModule.listenWithPortFallback
    ? await adminServerModule.listenWithPortFallback(preferredPort, host, 20)
    : (await listenServer(adminServerModule.server, host, preferredPort), preferredPort);
  process.env.NIGHTVAULT_PORT = String(port);
  adminServerUrl = process.env.NIGHTVAULT_PUBLIC_URL || `http://${host}:${port}`;
  const publicHint = host === "0.0.0.0" ? " Сервер слушает 0.0.0.0: подключай друзей через Radmin IP, например http://26.x.x.x:" + port + "." : "";
  adminServerStatus = { ok: true, mode: "embedded", url: adminServerUrl, message: (port === preferredPort ? "Сервер запущен." : `Порт ${preferredPort} был занят, сервер запущен на ${port}.`) + publicHint };
  pushAdminLog("info", [adminServerStatus.message, adminServerUrl]);
  return adminServerStatus;
}

function stopAdminServer() {
  if (!adminServerModule?.server?.listening) {
    adminServerStatus = { ok: false, mode: "idle", message: "Встроенный сервер не запущен из админ-приложения." };
    return adminServerStatus;
  }
  adminServerModule.server.close();
  adminServerStatus = { ok: false, mode: "stopped", message: "Сервер остановлен." };
  pushAdminLog("warn", [adminServerStatus.message]);
  return adminServerStatus;
}

function requireAdmin() {
  if (!adminAuthenticated) throw new Error("Требуется вход администратора.");
}
async function runAdminTest(name) {
  requireAdmin();
  const store = require("../server/lib/store");
  const cfg = require("../server/lib/config");
  const probe = async () => {
    const status = adminServerStatus.ok ? adminServerStatus : await startAdminServer();
    try { const u = new URL(status.url); return await probeNightVaultServer(u.hostname === "0.0.0.0" ? "127.0.0.1" : u.hostname, Number(u.port)); }
    catch { return false; }
  };
  return runRealAdminTest(String(name || ""), {
    store,
    config: cfg,
    adminAuthenticated,
    probeServer: probe,
    serverStatus: adminServerStatus,
  });
}

async function collectAdminDebugReport() {
  requireAdmin();
  const store = require("../server/lib/store");
  const cfg = require("../server/lib/config");
  const readiness = collectReadinessReport(store.db, cfg);
  const result = buildDebugReport({
    db: store.db,
    sqliteStatus: store.sqliteStatus(),
    readiness,
    serverStatus: adminServerStatus,
  });
  pushAdminLog("info", ["Debug report collected", result.path]);
  return result;
}

function coerceBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeWindowPrefs(saved = {}) {
  const fallback = {
    width: 1480,
    height: 920,
    x: undefined,
    y: undefined,
    maximized: false,
    fullscreen: false,
    closeToTray: true,
    minimizeToTray: false,
    startMaximized: false,
  };
  const next = { ...fallback, ...saved };
  next.width = Math.max(1050, Math.min(3200, Math.trunc(Number(next.width) || fallback.width)));
  next.height = Math.max(680, Math.min(2200, Math.trunc(Number(next.height) || fallback.height)));
  next.maximized = coerceBoolean(next.maximized, fallback.maximized);
  next.fullscreen = false;
  next.closeToTray = coerceBoolean(next.closeToTray, fallback.closeToTray);
  next.minimizeToTray = coerceBoolean(next.minimizeToTray, fallback.minimizeToTray);
  next.startMaximized = coerceBoolean(next.startMaximized, fallback.startMaximized);

  try {
    if (Number.isFinite(next.x) && Number.isFinite(next.y)) {
      const point = { x: Number(next.x), y: Number(next.y) };
      const displays = screen.getAllDisplays();
      const visible = displays.some((display) => {
        const area = display.workArea;
        return (
          point.x >= area.x - next.width + 160 &&
          point.x <= area.x + area.width - 160 &&
          point.y >= area.y - 80 &&
          point.y <= area.y + area.height - 80
        );
      });
      if (!visible) {
        next.x = undefined;
        next.y = undefined;
      }
    }
  } catch {
    next.x = undefined;
    next.y = undefined;
  }
  return next;
}

function readWindowPrefs() {
  return sanitizeWindowPrefs(readJsonSafe(windowPrefsPath(), {}));
}

function saveWindowPrefs(patch = {}) {
  const current = readWindowPrefs();
  const next = sanitizeWindowPrefs({ ...current, ...patch });
  writeJsonSafe(windowPrefsPath(), next);
  return next;
}

function rememberWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getNormalBounds();
    saveWindowPrefs({
      ...bounds,
      maximized: mainWindow.isMaximized(),
      fullscreen: mainWindow.isFullScreen(),
    });
  } catch {}
}

function createTray() {
  if (tray || process.platform === "darwin") return;
  try {
    tray = new Tray(path.join(__dirname, "../assets/icon.png"));
    tray.setToolTip("NightVault");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Открыть NightVault", click: showMainWindow },
        { type: "separator" },
        {
          label: "Выйти",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", showMainWindow);
    tray.on("double-click", showMainWindow);
  } catch (error) {
    tray = null;
    console.warn("Tray was not created:", error.message);
  }
}

function showMainWindow() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } catch {}
}

function hideToTray(reason = "manual") {
  createTray();
  try {
    mainWindow?.hide();
    if (reason === "close") {
      send("window-state", {
        fullscreen: false,
        hiddenToTray: true,
        message: "NightVault свернут в трей. Откройте его через иконку возле часов.",
      });
    }
  } catch {}
}

function getChangelog(version = app.getVersion()) {
  const data = readJsonSafe(changelogPath, {});
  return (
    data[version] ||
    data.latest || {
      title: `NightVault ${version}`,
      changes: ["Обновление установлено.", "Улучшена безопасность клиента."],
    }
  );
}

function send(channel, payload) {
  try {
    mainWindow?.webContents?.send(channel, payload);
  } catch {}
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizedServer(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function accountLookupKey(value) {
  const normalized = String(value || "");
  return /^[a-f0-9]{64}$/i.test(normalized) ? normalized : "";
}

function accountKey(server, username) {
  return crypto
    .createHash("sha256")
    .update(`${server}\0${String(username || "").toLowerCase()}`)
    .digest("hex");
}

function readAuthVault() {
  return {
    version: 1,
    current: "",
    accounts: {},
    ...readJsonSafe(authVaultPath(), {}),
  };
}

function secureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  try {
    return safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  } catch {
    return true;
  }
}

function encryptCredentials(credentials) {
  if (!secureStorageAvailable()) return "";
  return safeStorage
    .encryptString(JSON.stringify(credentials))
    .toString("base64");
}

function decryptCredentials(value) {
  try {
    if (!secureStorageAvailable() || !value) return null;
    return JSON.parse(
      safeStorage.decryptString(Buffer.from(String(value), "base64")),
    );
  } catch {
    return null;
  }
}

function publicAccounts(vault) {
  return Object.entries(vault.accounts || {})
    .map(([key, account]) => ({
      key,
      username: account.username,
      server: account.server,
      last: account.last || 0,
      current: key === vault.current,
    }))
    .sort((first, second) => second.last - first.last);
}

function saveAuthAccount(payload) {
  const server = normalizedServer(payload?.server);
  const username = String(payload?.username || "")
    .trim()
    .toLowerCase();
  const accessToken = String(payload?.accessToken || payload?.token || "");
  const refreshToken = String(payload?.refreshToken || "");
  if (!server || !/^[a-z0-9_]{3,32}$/.test(username)) {
    throw new Error("Некорректный сервер или имя пользователя.");
  }
  if (!accessToken || accessToken.length > 512 || refreshToken.length > 1024) {
    throw new Error("Некорректные данные сессии.");
  }
  const encrypted = encryptCredentials({ accessToken, refreshToken });
  if (!encrypted) {
    return {
      ok: false,
      persistent: false,
      message: "Защищённое хранилище ОС недоступно.",
    };
  }
  const vault = readAuthVault();
  const key = accountKey(server, username);
  vault.accounts[key] = {
    username,
    server,
    encrypted,
    last: Date.now(),
  };
  vault.current = key;
  writeJsonSafe(authVaultPath(), vault);
  return { ok: true, persistent: true, accounts: publicAccounts(vault) };
}

function getAuthAccount(key) {
  const vault = readAuthVault();
  const selectedKey = key ? accountLookupKey(key) : accountLookupKey(vault.current);
  const account = selectedKey ? vault.accounts?.[selectedKey] : null;
  if (!account) return null;
  const credentials = decryptCredentials(account.encrypted);
  if (!credentials) return null;
  return {
    key: selectedKey,
    username: account.username,
    server: account.server,
    accessToken: credentials.accessToken || "",
    refreshToken: credentials.refreshToken || "",
  };
}



function readSharedE2eeVault() {
  return { version: 1, keys: {}, ...readJsonSafe(sharedE2eeVaultPath(), {}) };
}

function e2eeVaultKey(server, username) {
  return accountKey(normalizedServer(server), String(username || "").toLowerCase());
}

function encryptE2eeIdentity(identity) {
  if (!secureStorageAvailable()) return "";
  return safeStorage.encryptString(JSON.stringify(identity)).toString("base64");
}

function decryptE2eeIdentity(value) {
  try {
    if (!secureStorageAvailable() || !value) return null;
    return JSON.parse(safeStorage.decryptString(Buffer.from(String(value), "base64")));
  } catch {
    return null;
  }
}

function saveSharedE2eeIdentity(payload = {}) {
  const server = normalizedServer(payload.server);
  const username = String(payload.username || "").trim().toLowerCase();
  const deviceId = String(payload.deviceId || "");
  const privateJwk = payload.privateJwk;
  const publicJwk = payload.publicJwk;
  if (!server || !/^[a-z0-9_]{3,32}$/.test(username) || !deviceId || !privateJwk || !publicJwk) {
    throw new Error("Некорректная E2EE identity.");
  }
  const encrypted = encryptE2eeIdentity({ deviceId, privateJwk, publicJwk, savedAt: Date.now() });
  if (!encrypted) return { ok: false, persistent: false, message: "Защищённое хранилище ОС недоступно." };
  const vault = readSharedE2eeVault();
  vault.keys[e2eeVaultKey(server, username)] = { server, username, encrypted, updatedAt: Date.now() };
  writeJsonSafe(sharedE2eeVaultPath(), vault);
  return { ok: true, persistent: true };
}

function loadSharedE2eeIdentity(payload = {}) {
  const key = e2eeVaultKey(payload.server, payload.username);
  const entry = readSharedE2eeVault().keys?.[key];
  if (!entry) return null;
  const identity = decryptE2eeIdentity(entry.encrypted);
  if (!identity?.deviceId || !identity?.privateJwk || !identity?.publicJwk) return null;
  return identity;
}

function probeNightVaultServer(host, port, timeoutMs = 900) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: "/api/health", timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk.slice(0, 2048); });
      res.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          resolve(Boolean(res.statusCode === 200 && payload.ok && payload.version));
        } catch {
          resolve(false);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function listenServer(serverInstance, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      serverInstance.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      serverInstance.off("error", onError);
      resolve();
    };
    serverInstance.once("error", onError);
    serverInstance.once("listening", onListening);
    serverInstance.listen(port, host);
  });
}

async function startBundledServer() {
  process.env.NIGHTVAULT_DATA_DIR ||= path.join(app.getPath("userData"), "server");
  process.env.NIGHTVAULT_HOST ||= "127.0.0.1";
  process.env.NIGHTVAULT_PORT ||= "3000";

  const host = process.env.NIGHTVAULT_HOST;
  const preferredPort = Number(process.env.NIGHTVAULT_PORT) || 3000;
  runtimeServerUrl = `http://${host}:${preferredPort}`;

  if (await probeNightVaultServer(host, preferredPort)) {
    runtimeServerStatus = { mode: "external", ok: true, url: runtimeServerUrl, message: "Подключён уже запущенный сервер NightVault." };
    console.info(`NightVault server already available at ${runtimeServerUrl}; using it.`);
    return;
  }

  if (process.env.NIGHTVAULT_DISABLE_BUNDLED_SERVER === "1") {
    runtimeServerStatus = { mode: "disabled", ok: false, url: runtimeServerUrl, message: "Встроенный сервер отключён переменной NIGHTVAULT_DISABLE_BUNDLED_SERVER." };
    return;
  }

  try {
    const serverModule = require("../server/server");
    bundledServer = serverModule.server;
    if (bundledServer.listening) {
      const address = bundledServer.address();
      const activePort = typeof address === "object" && address ? address.port : preferredPort;
      runtimeServerUrl = `http://${host}:${activePort}`;
      runtimeServerStatus = { mode: "bundled", ok: true, url: runtimeServerUrl, message: "Встроенный сервер уже запущен." };
      return;
    }

    const activePort = serverModule.listenWithPortFallback
      ? await serverModule.listenWithPortFallback(preferredPort, host, 20)
      : (await listenServer(bundledServer, host, preferredPort), preferredPort);
    process.env.NIGHTVAULT_PORT = String(activePort);
    runtimeServerUrl = `http://${host}:${activePort}`;
    runtimeServerStatus = { mode: "bundled", ok: true, url: runtimeServerUrl, message: activePort !== preferredPort ? `Порт ${preferredPort} был занят, сервер запущен на ${activePort}.` : "Встроенный сервер запущен." };
    console.info(`Bundled NightVault server started at ${runtimeServerUrl}.`);
    return;
  } catch (error) {
    bundledServer = null;
    runtimeServerStatus = { mode: "failed", ok: false, url: runtimeServerUrl, message: error?.message || String(error), code: error?.code || "" };
    console.warn("Bundled NightVault server was not started:", error?.message || error);
  }
}


function installCspHeaders() {
  const policy = [
    "default-src 'self'",
    "script-src 'self' file:",
    "script-src-elem 'self' file:",
    "script-src-attr 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src http: https: ws: wss:",
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [policy],
          'X-Content-Type-Options': ['nosniff'],
          'Referrer-Policy': ['no-referrer'],
        },
      });
    });
  } catch (error) {
    console.warn('CSP headers were not installed:', error.message);
  }
}

function createWindow() {
  const windowPrefs = readWindowPrefs();
  mainWindow = new BrowserWindow({
    width: Math.max(1050, Number(windowPrefs.width) || 1480),
    height: Math.max(680, Number(windowPrefs.height) || 920),
    x: Number.isFinite(windowPrefs.x) ? windowPrefs.x : undefined,
    y: Number.isFinite(windowPrefs.y) ? windowPrefs.y : undefined,
    minWidth: 1050,
    minHeight: 680,
    fullscreen: Boolean(windowPrefs.fullscreen),
    frame: false,
    title: "NightVault",
    backgroundColor: "#050000",
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: true,
      devTools: !app.isPackaged,
      partition: `persist:nightvault-client-${clientProfileId}`,
    },
  });

  const indexPath = path.join(__dirname, "index.html");
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error("NightVault renderer did-fail-load", { errorCode, errorDescription, validatedUrl });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("NightVault renderer process gone", details);
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("NightVault preload error", preloadPath, error?.message || error);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) console.warn("NightVault renderer console", { level, message, line, sourceId });
  });
  mainWindow.loadFile(indexPath);
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  }, 2500).unref?.();
  mainWindow.once("ready-to-show", () => {
    if (windowPrefs.startMaximized) mainWindow?.maximize();
    mainWindow?.show();
  });

  ["resize", "move", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"].forEach((eventName) =>
    mainWindow.on(eventName, () => setTimeout(rememberWindowBounds, 100)),
  );
  mainWindow.on("close", (event) => {
    rememberWindowBounds();
    const prefs = readWindowPrefs();
    if (!isQuitting && prefs.closeToTray && process.platform !== "darwin") {
      event.preventDefault();
      hideToTray("close");
    } else {
      isQuitting = true;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safe = safeExternalUrl(url);
    if (safe) shell.openExternal(safe).catch(() => {});
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = new URL(`file://${indexPath}`).pathname;
    let target = "";
    try {
      target = new URL(url).pathname;
    } catch {}
    if (target !== allowed) event.preventDefault();
  });

  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  const sendState = () =>
    send("window-state", { fullscreen: mainWindow.isFullScreen() });
  mainWindow.on("enter-full-screen", sendState);
  mainWindow.on("leave-full-screen", sendState);
  mainWindow.webContents.once("did-finish-load", () => {
    if (process.argv.includes("--debug") || process.env.NIGHTVAULT_DEBUG === "1") {
      try { mainWindow.webContents.openDevTools({ mode: "detach" }); } catch {}
    }
    sendState();
    maybeShowChangelog();
    setTimeout(checkForUpdatesSilent, 1400);
  });
}

function setupUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL?.({ provider: "github", owner: "Onmaynec", repo: "NightVault", releaseType: "release" });

  autoUpdater.on("checking-for-update", () =>
    send("update-status", { status: "checking" }),
  );
  autoUpdater.on("update-available", (info) => {
    updateInfo = info;
    send("update-available", {
      version: info.version,
      current: app.getVersion(),
      notes: info.releaseNotes || "",
    });
  });
  autoUpdater.on("update-not-available", (info) =>
    send("update-status", {
      status: "not-available",
      version: info?.version || app.getVersion(),
    }),
  );
  autoUpdater.on("download-progress", (progress) =>
    send("update-progress", {
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
    }),
  );
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    send("update-downloaded", { version: info.version });
  });
  autoUpdater.on("error", (error) =>
    send("update-error", { message: error?.message || String(error) }),
  );
}

function checkForUpdatesSilent() {
  if (!autoUpdater || !app.isPackaged) {
    send("update-status", {
      status: "dev-mode",
      message: "Автообновление работает только в установленной версии.",
    });
    return;
  }
  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    send("update-error", { message: error.message });
  }
}

function maybeShowChangelog() {
  const currentVersion = app.getVersion();
  const state = readJsonSafe(updateStatePath(), {});
  if (state.lastChangelogVersion === currentVersion) return;
  const data = getChangelog(currentVersion);
  send("show-changelog", { version: currentVersion, ...data });
  state.lastChangelogVersion = currentVersion;
  writeJsonSafe(updateStatePath(), state);
}

function isTrustedRenderer(webContents) {
  try {
    const raw = webContents?.getURL?.() || "";
    const url = new URL(raw);
    if (url.protocol !== "file:") return false;
    const loaded = decodeURIComponent(url.pathname).replace(/\\/g, "/");
    const allowedPages = ["index.html", "admin.html"].map((name) =>
      path.join(__dirname, name).replace(/\\/g, "/"),
    );
    return allowedPages.some((expected) => loaded.endsWith(expected)) ||
      loaded.endsWith("/src/index.html") ||
      loaded.endsWith("/src/admin.html");
  } catch {
    return false;
  }
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedRenderer(event.sender)) {
      throw new Error("Недоверенный источник IPC.");
    }
    return handler(event, ...args);
  });
}

if (singleInstanceEnabled) {
  app.on("second-instance", () => {
    if (isAdminMode) adminWindow?.show();
    else showMainWindow();
  });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      if (!isTrustedRenderer(webContents)) return callback(false);
      if (permission === "media") {
        const mediaTypes = details?.mediaTypes || [];
        return callback(
          mediaTypes.length > 0 && mediaTypes.every((type) => type === "audio"),
        );
      }
      return callback(false);
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, _origin, details) => {
      if (!isTrustedRenderer(webContents)) return false;
      return (
        permission === "media" &&
        (details?.mediaType === "audio" || !details?.mediaType)
      );
    },
  );
  installCspHeaders();
  if (isAdminMode) {
    createAdminWindow();
    return;
  }
  setupUpdater();
  await startBundledServer();
  createWindow();
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  rememberWindowBounds();
  try {
    bundledServer?.close();
  } catch {}
  try {
    if (adminServerModule?.server?.listening) adminServerModule.server.close();
  } catch {}
});



function runAdminConsoleCommand(commandText) {
  requireAdmin();
  const command = String(commandText || "").trim();
  if (!command) return { ok: true, text: "Введите команду. help — список команд." };
  const [cmdRaw, subRaw, ...rest] = command.split(/\s+/);
  const cmd = String(cmdRaw || "").toLowerCase();
  const sub = String(subRaw || "").toLowerCase();
  const arg = rest.join(" ").trim() || subRaw || "";
  const store = require("../server/lib/store");
  const db = store.db;
  if (cmd === "help" || cmd === "?") {
    return { ok: true, text: [
      "Команды NightVault Admin:",
      "help — список команд",
      "stats — краткая статистика сервера/БД",
      "tables — список таблиц SQLite/store",
      "info user <ник> — информация о пользователе",
      "sessions <ник> — активные сессии пользователя",
      "chat <id> — информация о чате",
      "logs — последние логи"
    ].join("\n") };
  }
  if (cmd === "stats") {
    return { ok: true, data: {
      server: adminServerStatus,
      users: Object.keys(db.users || {}).length,
      chats: Object.keys(db.chats || {}).length,
      messages: Object.values(db.messages || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
      files: Object.keys(db.files || {}).length,
      sessions: Object.keys(db.sessions || {}).length,
      logs: adminLogBuffer.length,
    }};
  }
  if (cmd === "tables") return { ok: true, data: store.listTables() };
  if (cmd === "logs") return { ok: true, data: adminLogBuffer.slice(-80) };
  if (cmd === "info" && sub === "user") {
    const username = String(rest[0] || "").toLowerCase();
    const user = db.users?.[username];
    if (!user) return { ok: false, text: "Пользователь не найден: " + username };
    const contacts = db.contacts?.[username] || {};
    const sessions = Object.values(db.sessions || {}).filter((s) => s.username === username);
    return { ok: true, data: {
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
      lastSeen: user.lastSeen,
      fingerprint: user.fingerprint,
      avatar: Boolean(user.avatar),
      banner: Boolean(user.banner),
      contacts: Object.keys(contacts).length,
      sessions: sessions.length,
      chats: Object.values(db.chats || {}).filter((chat) => (chat.members || []).includes(username)).length,
      twoFactor: Boolean(user.twoFactor),
    }};
  }
  if (cmd === "sessions") {
    const username = String(subRaw || "").toLowerCase();
    return { ok: true, data: Object.values(db.sessions || {}).filter((s) => !username || s.username === username).map((s) => ({ username: s.username, createdAt: s.createdAt, expiresAt: s.expiresAt, userAgent: s.userAgent, ip: s.ip })) };
  }
  if (cmd === "chat") {
    const chat = db.chats?.[subRaw];
    if (!chat) return { ok: false, text: "Чат не найден: " + subRaw };
    return { ok: true, data: { id: chat.id, type: chat.type, title: chat.title, owner: chat.owner, members: chat.members, admins: chat.admins, messages: (db.messages?.[chat.id] || []).length, avatar: Boolean(chat.avatar) } };
  }
  return { ok: false, text: "Неизвестная команда. Введите help." };
}

handle("admin-login", (_event, payload = {}) => {
  const ok = verifyAdminCredentials(payload.username, payload.password);
  adminAuthenticated = ok;
  if (!ok) return { ok: false, message: "Неверный логин или пароль администратора." };
  pushAdminLog("info", ["Администратор вошёл в Server Admin."]);
  return { ok: true, username: "admin", version: String(app.getVersion() || "").includes("globalfix") ? "1.3.5" : app.getVersion() };
});
handle("admin-change-password", (_event, payload = {}) => {
  requireAdmin();
  return changeAdminPassword(payload.currentPassword, payload.nextPassword);
});
handle("admin-start-server", () => { requireAdmin(); return startAdminServer(); });
handle("admin-stop-server", () => { requireAdmin(); return stopAdminServer(); });
handle("admin-status", () => ({ authenticated: adminAuthenticated, server: adminServerStatus, url: adminServerUrl, version: String(app.getVersion() || "").includes("globalfix") ? "1.3.5" : app.getVersion() }));
handle("admin-logs", () => { requireAdmin(); return adminLogBuffer.slice(-500); });
handle("admin-command", (_event, command) => runAdminConsoleCommand(command));
handle("admin-run-test", (_event, name) => runAdminTest(String(name || ""))); 
handle("admin-db-tables", () => { requireAdmin(); return require("../server/lib/store").listTables(); });
handle("admin-db-read", (_event, payload = {}) => { requireAdmin(); return require("../server/lib/store").readTable(String(payload.table || ""), Number(payload.limit || 200)); });
handle("admin-debug-report", () => collectAdminDebugReport());

handle("app-close", () => {
  try {
    (isAdminMode ? adminWindow : mainWindow)?.close();
  } catch {}
});

handle("app-minimize", () => {
  try {
    if (isAdminMode) return setTimeout(() => adminWindow?.minimize(), 80);
    const prefs = readWindowPrefs();
    if (mainWindow?.isFullScreen()) mainWindow.setFullScreen(false);
    if (prefs.minimizeToTray && process.platform !== "darwin") {
      setTimeout(() => hideToTray("minimize"), 80);
    } else {
      setTimeout(() => mainWindow?.minimize(), 80);
    }
  } catch {}
});

handle("app-toggle-fullscreen", () => {
  const target = isAdminMode ? adminWindow : mainWindow;
  return target?.setFullScreen(!target.isFullScreen());
});

handle("notify", async (_event, data) => {
  if (!Notification.isSupported()) return { ok: false };
  const title = String(data?.title || "NightVault").slice(0, 80);
  const body = String(data?.body || "").slice(0, 240);
  const notification = new Notification({
    title,
    body,
    icon: path.join(__dirname, "../assets/icon.png"),
  });
  notification.show();
  return { ok: true };
});

handle("open-external", async (_event, value) => {
  const url = safeExternalUrl(value);
  if (!url) return { ok: false };
  await shell.openExternal(url);
  return { ok: true };
});


function escapeHtmlForViewer(value = "") {
  return String(value).replace(/[&<>"']/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[m]);
}

handle("image-viewer-open", async (_event, payload = {}) => {
  const src = String(payload.src || "");
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) return { ok: false, error: "bad image source" };
  const title = String(payload.title || "Фото NightVault").slice(0, 120);
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 520,
    minHeight: 360,
    title,
    backgroundColor: "#050000",
    icon: path.join(__dirname, "../assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  const safeTitle = escapeHtmlForViewer(title);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>${safeTitle}</title><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050000;color:#fff;font-family:Segoe UI,Arial,sans-serif}.bar{height:46px;display:flex;align-items:center;gap:10px;padding:0 12px;background:#100306;border-bottom:1px solid #3a090e}.bar b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar button{border:1px solid #6d111d;background:#1a070b;color:#fff;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer}.bar button:hover{background:#e11b2f}.stage{height:calc(100% - 46px);display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 35%,#21050c,#020000 70%)}img{max-width:92vw;max-height:calc(100vh - 80px);transform:translate(var(--x,0px),var(--y,0px)) scale(var(--z,1));transition:transform .08s ease;cursor:grab;user-select:none}.hint{margin-left:auto;color:#cda0a5;font-size:12px}@media(max-width:700px){.hint{display:none}.bar button{padding:7px 9px}}
  </style></head><body><div class="bar"><b>${safeTitle}</b><button id="zin">＋</button><button id="zout">－</button><button id="reset">100%</button><button id="close">Закрыть</button><span class="hint">Колесо мыши — zoom, перетаскивание — pan</span></div><div class="stage"><img id="img" src="${src}" alt="${safeTitle}" draggable="false"></div><script>
  let z=1,x=0,y=0,drag=false,sx=0,sy=0; const img=document.getElementById('img'); function draw(){img.style.setProperty('--z',z);img.style.setProperty('--x',x+'px');img.style.setProperty('--y',y+'px');}
  document.getElementById('zin').onclick=()=>{z=Math.min(8,z*1.18);draw()}; document.getElementById('zout').onclick=()=>{z=Math.max(.15,z/1.18);draw()}; document.getElementById('reset').onclick=()=>{z=1;x=0;y=0;draw()}; document.getElementById('close').onclick=()=>close();
  window.addEventListener('wheel',e=>{e.preventDefault(); z=Math.max(.15,Math.min(8,z*(e.deltaY<0?1.12:.88))); draw();},{passive:false});
  img.addEventListener('pointerdown',e=>{drag=true;sx=e.clientX-x;sy=e.clientY-y;img.setPointerCapture(e.pointerId);img.style.cursor='grabbing'}); img.addEventListener('pointermove',e=>{if(!drag)return;x=e.clientX-sx;y=e.clientY-sy;draw()}); img.addEventListener('pointerup',()=>{drag=false;img.style.cursor='grab'}); window.addEventListener('keydown',e=>{if(e.key==='Escape')close(); if(e.key==='0'){z=1;x=0;y=0;draw()} if(e.key==='+'||e.key==='='){z=Math.min(8,z*1.18);draw()} if(e.key==='-'){z=Math.max(.15,z/1.18);draw()}}); draw();
  </script></body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  return { ok: true };
});

handle("auth-save", (_event, payload) => saveAuthAccount(payload));
handle("auth-current", () => getAuthAccount(""));
handle("auth-list", () => publicAccounts(readAuthVault()));
handle("auth-use", (_event, key) => {
  const selectedKey = accountLookupKey(key);
  const vault = readAuthVault();
  if (!selectedKey || !vault.accounts?.[selectedKey]) return null;
  vault.current = selectedKey;
  vault.accounts[selectedKey].last = Date.now();
  writeJsonSafe(authVaultPath(), vault);
  return getAuthAccount(selectedKey);
});
handle("auth-remove", (_event, key) => {
  const selectedKey = accountLookupKey(key);
  const vault = readAuthVault();
  if (selectedKey) delete vault.accounts?.[selectedKey];
  if (vault.current === selectedKey) vault.current = "";
  writeJsonSafe(authVaultPath(), vault);
  return publicAccounts(vault);
});
handle("e2ee-key-load", (_event, payload) => loadSharedE2eeIdentity(payload));
handle("e2ee-key-save", (_event, payload) => saveSharedE2eeIdentity(payload));

handle("auth-clear-current", () => {
  const vault = readAuthVault();
  if (vault.current) delete vault.accounts?.[vault.current];
  vault.current = "";
  writeJsonSafe(authVaultPath(), vault);
  return { ok: true };
});

handle("updates-check", async () => {
  if (!autoUpdater || !app.isPackaged) {
    return {
      ok: false,
      dev: true,
      current: app.getVersion(),
      message: "Автообновления работают только в установленном приложении.",
    };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true, current: app.getVersion() };
  } catch (error) {
    return { ok: false, current: app.getVersion(), error: error.message };
  }
});

handle("updates-download", async () => {
  if (!autoUpdater || !updateInfo) {
    return { ok: false, error: "Обновление не найдено." };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

handle("updates-install", async () => {
  if (!autoUpdater || !updateDownloaded) {
    return { ok: false, error: "Обновление ещё не скачано." };
  }
  try {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

handle("server-info", () => ({
  url: runtimeServerUrl,
  status: runtimeServerStatus,
  clientProfileId,
  userDataPath: app.getPath("userData"),
}));
handle("client-report", (_event, payload = {}) => {
  const report = {
    type: String(payload.type || "renderer").slice(0, 64),
    message: String(payload.message || "").slice(0, 1200),
    stack: String(payload.stack || "").slice(0, 2400),
    time: Date.now(),
    version: app.getVersion(),
  };
  console.warn("NightVault client report", report);
  return { ok: true };
});

handle("window-prefs-get", () => readWindowPrefs());
handle("window-prefs-set", (_event, payload = {}) => {
  const current = readWindowPrefs();
  const next = saveWindowPrefs({
    closeToTray: coerceBoolean(payload.closeToTray, current.closeToTray),
    minimizeToTray: coerceBoolean(payload.minimizeToTray, current.minimizeToTray),
    startMaximized: coerceBoolean(payload.startMaximized, current.startMaximized),
  });
  return next;
});
handle("app-version", () => { const v = app.getVersion() || "1.3.5"; return String(v).includes("globalfix") ? "1.3.5" : v; });
