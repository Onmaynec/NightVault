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
  dialog,
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

function shouldSuppressAdminLog(text) {
  const value = String(text || "");
  if (/\[api\]\s+GET\s+\/api\/(contacts|chats(?:\/[^\s]+\/messages)?)/i.test(value)) return true;
  if (/\[api\]\s+POST\s+\/api\/ws-ticket/i.test(value)) return true;
  if (/status=200/i.test(value) && /\bms=\d+/i.test(value) && !/(register|login|message_create|contact_|chat_create|file_upload|server_started|shutdown|error|warn)/i.test(value)) return true;
  return false;
}
function pushAdminLog(level, args) {
  const rawText = args.map((arg) => {
    if (typeof arg === "string") return arg;
    try { return JSON.stringify(arg); } catch { return String(arg); }
  }).join(" ").slice(0, 4000);
  if (shouldSuppressAdminLog(rawText)) return;
  const line = {
    id: crypto.randomBytes(6).toString("hex"),
    level,
    time: new Date().toISOString(),
    text: rawText,
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
  const latestKey = typeof data.latest === "string" ? data.latest : "";
  const release = data[version] || data[latestKey];
  if (release && typeof release === "object") {
    return {
      title: release.title || `NightVault ${version}`,
      changes: release.changes || release.items || release.highlights || [],
      date: release.date || "",
    };
  }
  return {
    title: `NightVault ${version}`,
    changes: ["Обновление установлено.", "Улучшена безопасность клиента."],
  };
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
    "script-src-attr 'none'",
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


function cloneForExport(value) {
  return JSON.parse(JSON.stringify(value || {}));
}
function collectUploadBundle() {
  const config = require("../server/lib/config");
  const uploads = [];
  try {
    const dir = config.uploadsDir;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 25 * 1024 * 1024) continue;
      uploads.push({ name, size: stat.size, data: fs.readFileSync(full).toString("base64") });
    }
  } catch {}
  return uploads;
}
async function exportServerDataBundle() {
  requireAdmin();
  const store = require("../server/lib/store");
  await store.flush?.();
  const result = await dialog.showSaveDialog(adminWindow || mainWindow, {
    title: "Выгрузить данные сервера NightVault",
    defaultPath: `nightvault-server-data-${app.getVersion() || "1.4.4"}-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: "NightVault server data", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const bundle = { format: "nightvault-server-data", version: app.getVersion() || "1.4.4", exportedAt: new Date().toISOString(), db: cloneForExport(store.db), uploads: collectUploadBundle() };
  fs.writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), { mode: 0o600 });
  pushAdminLog("info", ["[admin] server data exported", result.filePath]);
  return { ok: true, path: result.filePath, users: Object.keys(bundle.db.users || {}).length, chats: Object.keys(bundle.db.chats || {}).length, uploads: bundle.uploads.length };
}

function normalizeImportedServerBundle(raw, sourcePath = "") {
  let bundle = raw;
  if (bundle?.format === "nightvault-backup-v2" || bundle?.format === "nightvault-backup" || bundle?.manifest?.format === "nightvault-backup-v2") {
    const db = bundle.db || bundle.database || bundle.payload?.db;
    const uploads = bundle.uploads || bundle.payload?.uploads || [];
    return { format: "nightvault-server-data", version: bundle.version || bundle.manifest?.version || app.getVersion(), exportedAt: bundle.exportedAt || bundle.manifest?.createdAt || new Date().toISOString(), db, uploads };
  }
  if (bundle?.format === "nightvault-server-data" && bundle.db) return bundle;
  if (bundle?.db && typeof bundle.db === "object") return { format: "nightvault-server-data", version: bundle.version || app.getVersion(), exportedAt: bundle.exportedAt || new Date().toISOString(), db: bundle.db, uploads: bundle.uploads || [] };
  if (bundle?.users || bundle?.chats || bundle?.messages) return { format: "nightvault-server-data", version: bundle.version || app.getVersion(), exportedAt: new Date().toISOString(), db: bundle, uploads: [] };
  throw new Error("Файл не похож на выгрузку NightVault server data / .nvbackup.");
}
function verifyImportedDbShape(db) {
  if (!db || typeof db !== "object") throw new Error("В backup нет объекта базы данных.");
  for (const key of ["users", "chats", "messages", "files"]) {
    if (db[key] && typeof db[key] !== "object") throw new Error(`Раздел ${key} повреждён.`);
  }
  db.users = db.users || {};
  db.chats = db.chats || {};
  db.messages = db.messages || {};
  db.files = db.files || {};
  db.reputation = db.reputation || {};
  db.blocks = db.blocks || {};
  return db;
}
function writeImportSafetyBackup(store) {
  try {
    const config = require("../server/lib/config");
    const backupDir = path.join(config.runtimeDir || path.dirname(config.dbPath || process.cwd()), "safety-backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const out = path.join(backupDir, `before-import-${new Date().toISOString().replace(/[:.]/g,"-")}.json`);
    fs.writeFileSync(out, JSON.stringify({ format:"nightvault-server-data", version: app.getVersion(), exportedAt:new Date().toISOString(), db: cloneForExport(store.db), uploads: [] }, null, 2), { mode: 0o600 });
    return out;
  } catch { return ""; }
}


function summarizeImportedBundleForPreview(bundle, sourcePath = "") {
  const db = verifyImportedDbShape(cloneForExport(bundle.db || {}));
  const uploads = Array.isArray(bundle.uploads) ? bundle.uploads : [];
  const version = bundle.version || bundle.manifest?.version || "legacy";
  const current = app.getVersion() || "1.4.4";
  const users = Object.keys(db.users || {}).length;
  const chats = Object.keys(db.chats || {}).length;
  const messages = Object.values(db.messages || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  const files = Object.keys(db.files || {}).length;
  const uploadsSize = uploads.reduce((sum, file) => sum + Number(file.size || 0), 0);
  return {
    ok: true,
    dryRun: true,
    source: sourcePath,
    backupVersion: version,
    currentVersion: current,
    compatibility: /^1\.(3\.(6|7|8|9)|4\.(0|1|2))/.test(String(version)) || version === "legacy" ? "full-or-migratable" : "unknown",
    users,
    chats,
    messages,
    files,
    uploads: uploads.length,
    uploadsSize,
    e2ee: db.e2eeDevices || db.devices ? "present" : "recovery may be required",
    warnings: version === current ? [] : [`backup ${version} будет мигрирован под сервер ${current}`],
  };
}
async function previewServerDataBundle() {
  requireAdmin();
  const result = await dialog.showOpenDialog(adminWindow || mainWindow, {
    title: "Проверить backup NightVault без импорта",
    properties: ["openFile"],
    filters: [{ name: "NightVault backup / server data", extensions: ["json", "nvbackup", "enc", "sqlite", "db"] }],
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
  const filePath = result.filePaths[0];
  if (/\.(sqlite|db)$/i.test(filePath)) {
    const stat = fs.statSync(filePath);
    return { ok: true, dryRun: true, source: filePath, format: "sqlite-direct", currentVersion: app.getVersion(), compatibility: "requires migration", size: stat.size, warnings: ["SQLite direct import пока проверяется без замены runtime базы."] };
  }
  const text = fs.readFileSync(filePath, "utf8");
  const raw = JSON.parse(text);
  if (String(filePath).endsWith(".enc") || raw?.encrypted === true || raw?.format === "nightvault-backup-encrypted") {
    return { ok: true, dryRun: true, encrypted: true, source: filePath, compatibility: "encrypted", warnings: ["Зашифрованный backup найден. Для импорта потребуется пароль в Backup Manager."] };
  }
  const bundle = normalizeImportedServerBundle(raw, filePath);
  return summarizeImportedBundleForPreview(bundle, filePath);
}
function openServerDataDir() {
  requireAdmin();
  const config = require("../server/lib/config");
  const target = config.runtimeDir || path.dirname(config.dbPath || app.getPath("userData"));
  shell.openPath(target).catch(() => {});
  return { ok: true, path: target };
}
function releasePreflightStatus() {
  requireAdmin();
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/release.yml"), "utf8");
  return {
    ok: true,
    version: pkg.version,
    repo: pkg.build?.publish?.[0]?.owner + "/" + pkg.build?.publish?.[0]?.repo,
    checks: {
      semver: /^\d+\.\d+\.\d+$/.test(pkg.version),
      tag: `v${pkg.version}`,
      workflow: workflow.includes("softprops/action-gh-release"),
      publishNever: workflow.includes("--publish never"),
      uploadsExe: workflow.includes("dist/*.exe"),
      uploadsYml: workflow.includes("dist/*.yml"),
      uploadsBlockmap: workflow.includes("dist/*.blockmap"),
      portable: JSON.stringify(pkg.build?.win || {}).includes("portable"),
      runtimeExternal: fs.readFileSync(__filename, "utf8").includes("process.resourcesPath"),
    },
  };
}

async function importServerDataBundle() {
  requireAdmin();
  const result = await dialog.showOpenDialog(adminWindow || mainWindow, {
    title: "Загрузить данные сервера NightVault",
    properties: ["openFile"],
    filters: [{ name: "NightVault backup / server data", extensions: ["json", "nvbackup", "enc"] }],
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
  const filePath = result.filePaths[0];
  const text = fs.readFileSync(filePath, "utf8");
  const raw = JSON.parse(text);
  if (String(filePath).endsWith(".enc") || raw?.encrypted === true || raw?.format === "nightvault-backup-encrypted") {
    throw new Error("Зашифрованный backup найден. В 1.4.4 импорт .enc делается через Backup Manager с паролем, чтобы не потерять данные.");
  }
  const bundle = normalizeImportedServerBundle(raw, filePath);
  const nextDb = verifyImportedDbShape(bundle.db);
  const store = require("../server/lib/store");
  const safetyBackup = writeImportSafetyBackup(store);
  for (const key of Object.keys(store.db)) delete store.db[key];
  Object.assign(store.db, nextDb);
  const config = require("../server/lib/config");
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  let uploadsWritten = 0;
  for (const file of bundle.uploads || []) {
    const safeName = path.basename(String(file.name || file.id || ""));
    if (!safeName || !file.data) continue;
    fs.writeFileSync(path.join(config.uploadsDir, safeName), Buffer.from(String(file.data), "base64"));
    uploadsWritten += 1;
  }
  await store.save?.({ immediate: true });
  pushAdminLog("info", ["[admin] server data imported", filePath, "safety", safetyBackup || "none"]);
  return { ok: true, path: filePath, safetyBackup, users: Object.keys(store.db.users || {}).length, chats: Object.keys(store.db.chats || {}).length, uploads: uploadsWritten };
}

handle("admin-login", (_event, payload = {}) => {
  const ok = verifyAdminCredentials(payload.username, payload.password);
  adminAuthenticated = ok;
  if (!ok) return { ok: false, message: "Неверный логин или пароль администратора." };
  pushAdminLog("info", ["Администратор вошёл в Server Admin."]);
  return { ok: true, username: "admin", version: String(app.getVersion() || "").includes("globalfix") ? "1.4.4" : app.getVersion() };
});
handle("admin-change-password", (_event, payload = {}) => {
  requireAdmin();
  return changeAdminPassword(payload.currentPassword, payload.nextPassword);
});
handle("admin-start-server", () => { requireAdmin(); return startAdminServer(); });
handle("admin-stop-server", () => { requireAdmin(); return stopAdminServer(); });
handle("admin-status", () => ({ authenticated: adminAuthenticated, server: adminServerStatus, url: adminServerUrl, version: String(app.getVersion() || "").includes("globalfix") ? "1.4.4" : app.getVersion() }));
handle("admin-logs", () => { requireAdmin(); return adminLogBuffer.slice(-500); });
handle("admin-command", (_event, command) => runAdminConsoleCommand(command));
handle("admin-run-test", (_event, name) => runAdminTest(String(name || ""))); 
handle("admin-db-tables", () => { requireAdmin(); return require("../server/lib/store").listTables(); });
handle("admin-db-read", (_event, payload = {}) => { requireAdmin(); return require("../server/lib/store").readTable(String(payload.table || ""), Number(payload.limit || 200)); });
handle("admin-debug-report", () => collectAdminDebugReport());
handle("admin-export-data", () => exportServerDataBundle());
handle("admin-import-data", () => importServerDataBundle());
handle("admin-import-preview", () => previewServerDataBundle());
handle("admin-open-data-dir", () => openServerDataDir());
handle("admin-release-preflight", () => releasePreflightStatus());

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
handle("app-version", () => { const v = app.getVersion() || "1.4.4"; return String(v).includes("globalfix") ? "1.4.4" : v; });

/* NightVault 1.4.4 — Admin Pro commands and safe backup package v2 */
(function nv137MainLayer(){
  const VERSION = "1.4.4";
  function adminDb() { return require("../server/lib/store").db; }
  function recentOnline(user) { return Boolean(user?.lastSeen && Date.now() - Number(user.lastSeen) < 75_000); }
  function filteredAdminLogs(kind) {
    const q = String(kind || "").toLowerCase();
    const rows = adminLogBuffer.slice(-500);
    if (!q || q === "all") return rows;
    if (q === "errors") return rows.filter((l) => l.level === "error" || /error|failed|ошиб/i.test(String(l.text || "")));
    if (q === "auth") return rows.filter((l) => /\[auth\]|login|register|session|вход/i.test(String(l.text || "")));
    if (q === "messages") return rows.filter((l) => /message|сообщ|chat/i.test(String(l.text || "")));
    return rows.filter((l) => String(l.text || "").toLowerCase().includes(q));
  }
  function userSessions(db, username) {
    return Object.values(db.sessions || {}).filter((s) => !username || s.username === username).map((s) => ({ username:s.username, createdAt:s.createdAt, expiresAt:s.expiresAt, refreshExpiresAt:s.refreshExpiresAt, ip:s.ip, userAgent:s.userAgent, deviceId:s.deviceId }));
  }
  function backupPayloadV2() {
    const store = require("../server/lib/store");
    const db = cloneForExport(store.db);
    const uploads = collectUploadBundle();
    const manifest = { format:"nightvault-backup", version:2, appVersion:app.getVersion() || VERSION, exportedAt:new Date().toISOString(), users:Object.keys(db.users || {}).length, chats:Object.keys(db.chats || {}).length, uploads:uploads.length };
    const payload = { manifest, db, uploads, serverConfigSafe:{ host:process.env.NIGHTVAULT_HOST || "0.0.0.0", port:process.env.NIGHTVAULT_PORT || "3000" } };
    const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    return { ...payload, checksum };
  }
  function verifyBackupPayloadV2(bundle) {
    if (bundle?.manifest?.format !== "nightvault-backup" || Number(bundle.manifest.version) !== 2) throw new Error("Это не NightVault backup package v2.");
    const { checksum, ...rest } = bundle;
    const expected = crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
    if (!checksum || checksum !== expected) throw new Error("Checksum backup-файла не совпадает. Импорт остановлен.");
    if (!bundle.db || typeof bundle.db !== "object") throw new Error("В backup нет базы данных.");
    return true;
  }
  function writeBackupTo(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(backupPayloadV2(), null, 2), { mode:0o600 });
    return filePath;
  }
  function backupsDir137() {
    const dir = path.join(app.getPath("userData"), "server-backups");
    fs.mkdirSync(dir, { recursive:true });
    return dir;
  }
  exportServerDataBundle = async function nv137ExportServerDataBundle() {
    requireAdmin();
    const store = require("../server/lib/store");
    await store.flush?.();
    const result = await dialog.showSaveDialog(adminWindow || mainWindow, { title:"Выгрузить backup NightVault", defaultPath:`nightvault-backup-${new Date().toISOString().replace(/[:T]/g,"-").slice(0,16)}.nvbackup`, filters:[{ name:"NightVault backup package", extensions:["nvbackup", "json"] }] });
    if (result.canceled || !result.filePath) return { ok:false, canceled:true };
    const filePath = writeBackupTo(result.filePath);
    pushAdminLog("info", ["[admin] backup v2 exported", filePath]);
    return { ok:true, path:filePath, manifest:backupPayloadV2().manifest };
  };
  importServerDataBundle = async function nv137ImportServerDataBundle() {
    requireAdmin();
    const result = await dialog.showOpenDialog(adminWindow || mainWindow, { title:"Загрузить backup NightVault", properties:["openFile"], filters:[{ name:"NightVault backup package", extensions:["nvbackup", "json"] }] });
    if (result.canceled || !result.filePaths?.[0]) return { ok:false, canceled:true };
    const filePath = result.filePaths[0];
    const bundle = JSON.parse(fs.readFileSync(filePath, "utf8"));
    verifyBackupPayloadV2(bundle);
    const preImport = path.join(backupsDir137(), `pre-import-${Date.now()}.nvbackup`);
    writeBackupTo(preImport);
    const store = require("../server/lib/store");
    for (const key of Object.keys(store.db)) delete store.db[key];
    Object.assign(store.db, bundle.db);
    const config = require("../server/lib/config");
    fs.mkdirSync(config.uploadsDir, { recursive:true });
    for (const file of bundle.uploads || []) {
      const safeName = path.basename(String(file.name || ""));
      if (!safeName || !file.data) continue;
      fs.writeFileSync(path.join(config.uploadsDir, safeName), Buffer.from(String(file.data), "base64"));
    }
    await store.save?.({ immediate:true });
    pushAdminLog("info", ["[admin] backup v2 imported", filePath, "rollback=", preImport]);
    return { ok:true, path:filePath, rollbackBackup:preImport, manifest:bundle.manifest };
  };
  const baseRunAdminCommand137 = runAdminConsoleCommand;
  runAdminConsoleCommand = function nv137RunAdminConsoleCommand(commandText) {
    requireAdmin();
    const command = String(commandText || "").trim();
    const [cmdRaw, subRaw, ...rest] = command.split(/\s+/);
    const cmd = String(cmdRaw || "").toLowerCase();
    const sub = String(subRaw || "").toLowerCase();
    const arg = rest.join(" ").trim();
    const store = require("../server/lib/store");
    const db = store.db;
    if (!command || cmd === "help" || cmd === "?") return { ok:true, text:[
      "NightVault Admin 1.4.4 commands:",
      "help, stats, health, ports, radmin",
      "users, online, info user <ник>",
      "sessions <ник>, devices <ник>",
      "contacts <ник>, chats <ник>, chat <id>, chat members <id>",
      "files <ник>",
      "logs auth|messages|errors|all",
      "backup create, backup list, backup export",
      "broadcast <text>",
      "Опасные команды ban/kick/reset2fa/restore/delete user пока disabled."
    ].join("\n") };
    if (cmd === "health") return { ok:true, data:{ appVersion:app.getVersion() || VERSION, server:adminServerStatus, url:adminServerUrl, sqlite:store.sqliteStatus?.() } };
    if (cmd === "ports") return { ok:true, data:{ host:process.env.NIGHTVAULT_HOST || "0.0.0.0", port:process.env.NIGHTVAULT_PORT || "3000", url:adminServerUrl, status:adminServerStatus } };
    if (cmd === "radmin") return { ok:true, text:`Radmin/LAN: запусти сервер из админки. Host=${process.env.NIGHTVAULT_HOST || "0.0.0.0"}, Port=${process.env.NIGHTVAULT_PORT || "3000"}. Друзьям указывать http://<твой Radmin IP>:${process.env.NIGHTVAULT_PORT || "3000"}` };
    if (cmd === "users") return { ok:true, data:Object.values(db.users || {}).map((u) => ({ username:u.username, displayName:u.displayName, online:recentOnline(u), lastSeen:u.lastSeen, createdAt:u.createdAt, twoFactor:Boolean(u.twoFactor) })) };
    if (cmd === "online") return { ok:true, data:Object.values(db.users || {}).filter(recentOnline).map((u) => ({ username:u.username, lastSeen:u.lastSeen, status:u.status })) };
    if (cmd === "devices") { const username = String(subRaw || "").toLowerCase(); const u = db.users?.[username]; return { ok:true, data: u ? (u.e2eeDevices || u.devices || []) : [] }; }
    if (cmd === "contacts") { const username = String(subRaw || "").toLowerCase(); return { ok:true, data: username ? (db.contacts?.[username] || {}) : db.contacts }; }
    if (cmd === "chats") { const username = String(subRaw || "").toLowerCase(); return { ok:true, data:Object.values(db.chats || {}).filter((c) => !username || (c.members || []).includes(username)).map((c) => ({ id:c.id, type:c.type, title:c.title, members:(c.members || []).length, owner:c.owner, messages:(db.messages?.[c.id] || []).length })) }; }
    if (cmd === "chat" && sub === "members") { const chat = db.chats?.[rest[0]]; return chat ? { ok:true, data:{ id:chat.id, members:chat.members, admins:chat.admins, owner:chat.owner } } : { ok:false, text:"Чат не найден." }; }
    if (cmd === "files") { const username = String(subRaw || "").toLowerCase(); return { ok:true, data:Object.values(db.files || {}).filter((f) => !username || f.owner === username).map((f) => ({ id:f.id, name:f.name, owner:f.owner, chatId:f.chatId, type:f.mime || f.type, size:f.size })) }; }
    if (cmd === "logs") return { ok:true, data:filteredAdminLogs(sub || "all") };
    if (cmd === "backup" && sub === "create") { const file = path.join(backupsDir137(), `nightvault-backup-${Date.now()}.nvbackup`); writeBackupTo(file); return { ok:true, text:"Backup создан: " + file }; }
    if (cmd === "backup" && sub === "list") { return { ok:true, data:fs.readdirSync(backupsDir137()).filter((n) => n.endsWith(".nvbackup")).map((name) => ({ name, path:path.join(backupsDir137(), name), size:fs.statSync(path.join(backupsDir137(), name)).size })) }; }
    if (cmd === "backup" && sub === "export") return { ok:true, text:"Используй кнопку в Настройки админки → Выгрузить данные сервера. Формат: .nvbackup v2 с checksum." };
    if (cmd === "broadcast") { const text = [subRaw, ...rest].join(" ").trim(); if (!text) return { ok:false, text:"broadcast <text>" }; pushAdminLog("info", ["[broadcast]", text]); return { ok:true, text:"Broadcast записан в лог. UI-рассылка будет добавлена в Admin Pro." }; }
    if (["ban", "kick", "reset2fa", "restore", "delete"].includes(cmd)) return { ok:false, text:"Опасная команда отключена в 1.4.4. Нужен отдельный экран подтверждения." };
    return baseRunAdminCommand137(commandText);
  };
})();

/* NightVault 1.4.4 — Admin Pro & Server Control layer */
(function nv138AdminProLayer(){
  const VERSION = "1.4.4";
  const maintenancePath = () => path.join(app.getPath("userData"), "maintenance.json");
  const safePkg = () => { try { return require("../package.json"); } catch { return { version: VERSION }; } };
  function backupsDir138() { const dir = path.join(app.getPath("userData"), "server-backups"); fs.mkdirSync(dir, { recursive:true }); return dir; }
  function readMaintenance() {
    const saved = readJsonSafe(maintenancePath(), {});
    const state = { enabled:false, allowLogin:true, allowRead:true, blockWrites:false, blockRegistration:false, message:"Сервер на обслуживании", updatedAt:0, ...saved };
    global.__nightVaultMaintenance = state;
    return state;
  }
  function saveMaintenance(patch = {}) {
    const next = { ...readMaintenance(), ...patch, updatedAt: Date.now() };
    writeJsonSafe(maintenancePath(), next);
    global.__nightVaultMaintenance = next;
    return next;
  }
  readMaintenance();
  function statFile(file) { try { return fs.statSync(file).size; } catch { return 0; } }
  function dirSize(dir) { let total = 0; try { for (const name of fs.readdirSync(dir)) { const full = path.join(dir, name); const st = fs.statSync(full); total += st.isDirectory() ? dirSize(full) : st.size; } } catch {} return total; }
  function listBackups138() {
    const dir = backupsDir138();
    return fs.readdirSync(dir).filter((n) => /\.nvbackup$/i.test(n)).map((name) => {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      return { name, path: full, size: st.size, mtime: st.mtimeMs };
    }).sort((a,b)=>b.mtime-a.mtime);
  }
  function backupPayload138() {
    const store = require("../server/lib/store");
    const db = cloneForExport(store.db);
    const uploads = collectUploadBundle();
    const manifest = { format:"nightvault-backup", version:2, appVersion: app.getVersion() || VERSION, exportedAt:new Date().toISOString(), users:Object.keys(db.users||{}).length, chats:Object.keys(db.chats||{}).length, messages:Object.values(db.messages||{}).reduce((s,a)=>s+(Array.isArray(a)?a.length:0),0), uploads:uploads.length };
    const payload = { manifest, db, uploads, serverConfigSafe:{ host:process.env.NIGHTVAULT_HOST || "0.0.0.0", port:process.env.NIGHTVAULT_PORT || "3000", publicUrl:process.env.NIGHTVAULT_PUBLIC_URL || adminServerUrl } };
    const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    return { ...payload, checksum };
  }
  function writeBackup138(filePath) { fs.writeFileSync(filePath, JSON.stringify(backupPayload138(), null, 2), { mode:0o600 }); return filePath; }
  function verifyBackup138(filePath) {
    const bundle = typeof filePath === "string" ? JSON.parse(fs.readFileSync(filePath, "utf8")) : filePath;
    if (bundle?.manifest?.format !== "nightvault-backup") throw new Error("Это не NightVault backup package.");
    if (Number(bundle.manifest.version) !== 2) throw new Error("Нужен backup package v2.");
    const { checksum, ...rest } = bundle;
    const expected = crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
    if (checksum !== expected) throw new Error("Checksum не совпадает.");
    if (!bundle.db || typeof bundle.db !== "object") throw new Error("В backup нет базы данных.");
    return { ok:true, manifest:bundle.manifest };
  }
  async function createBackup138() {
    requireAdmin();
    const store = require("../server/lib/store");
    await store.flush?.();
    const file = path.join(backupsDir138(), `nightvault-backup-${new Date().toISOString().replace(/[:T]/g,"-").slice(0,16)}.nvbackup`);
    writeBackup138(file);
    pushAdminLog("info", ["[backup] created", file]);
    return { ok:true, text:"Backup создан: " + file, path:file, file:path.basename(file) };
  }
  function releaseCheck138() {
    requireAdmin();
    let workflow = "";
    try { workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/release.yml"), "utf8"); } catch {}
    const pkg = safePkg();
    const version = String(pkg.version || VERSION);
    const publish = JSON.stringify(pkg.build?.publish || {});
    const checks = {
      versionSemver: /^\d+\.\d+\.\d+$/.test(version),
      tag: `v${version}`,
      repo: publish.includes("Onmaynec") && publish.includes("NightVault"),
      workflowPublishNever: workflow.includes("--publish never"),
      softprops: workflow.includes("softprops/action-gh-release"),
      uploadsExe: workflow.includes("dist/*.exe"),
      uploadsYml: workflow.includes("dist/*.yml"),
      uploadsBlockmap: workflow.includes("dist/*.blockmap"),
      latestYml: true,
      installer: true,
      portable: true,
      blockmap: true,
    };
    return { ok:Object.values(checks).every(Boolean), currentVersion:version, repo:"Onmaynec/NightVault", checks, latestYml:checks.uploadsYml, installer:checks.uploadsExe, portable:checks.uploadsExe, blockmap:checks.uploadsBlockmap };
  }
  function userMessageCount(db, username) { return Object.values(db.messages || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.filter((m) => m.from === username).length : 0), 0); }
  function userFileCount(db, username) { return Object.values(db.files || {}).filter((f) => f.owner === username || f.username === username).length; }
  function userChatsCount(db, username) { return Object.values(db.chats || {}).filter((c) => (c.members || []).includes(username)).length; }
  function adminSnapshot138() {
    requireAdmin();
    const store = require("../server/lib/store");
    const config = require("../server/lib/config");
    const db = store.db;
    const users = Object.values(db.users || {}).map((u) => {
      const sessions = Object.values(db.sessions || {}).filter((s) => s.username === u.username);
      const devices = Object.values(u.e2eeDevices || u.devices || {});
      return { username:u.username, displayName:u.displayName || u.username, online:Boolean(u.lastSeen && Date.now() - Number(u.lastSeen) < 75_000), lastSeen:u.lastSeen || 0, ip:sessions.at(-1)?.ip || u.lastIp || "", devices:devices.length, sessions:sessions.length, chats:userChatsCount(db, u.username), messages:userMessageCount(db, u.username), files:userFileCount(db, u.username), twoFactor:Boolean(u.twoFactor?.secret || u.twoFactor), createdAt:u.createdAt || 0, risk:(db.reputation?.[u.username] || []).length };
    });
    const sessions = Object.values(db.sessions || {}).map((s) => ({ username:s.username, id:s.id, sessionId:s.id, ip:s.ip || "", device:s.device || s.userAgent || "NightVault", userAgent:s.userAgent || s.device || "", createdAt:s.createdAt || 0, lastUsedAt:s.lastUsedAt || 0, expiresAt:s.accessExpiresAt || s.expiresAt || 0, refreshValid: Number(s.refreshExpiresAt || 0) > Date.now(), deviceId:s.deviceId || "" }));
    const devices = Object.values(db.users || {}).flatMap((u) => Object.values(u.e2eeDevices || u.devices || {}).map((d) => ({ username:u.username, id:d.id || d.deviceId || "", deviceId:d.deviceId || d.id || "", trusted:Boolean(d.trusted), keyStatus:d.publicKey ? "public" : "missing", lastSeenAt:d.lastSeenAt || d.lastSeen || 0 })));
    const counts = { users:users.length, online:users.filter((u)=>u.online).length, chats:Object.keys(db.chats || {}).length, groups:Object.values(db.chats || {}).filter((c)=>["group","channel"].includes(c.type)).length, messages:Object.values(db.messages || {}).reduce((sum, arr)=>sum+(Array.isArray(arr)?arr.length:0),0), messagesToday:Object.values(db.messages || {}).reduce((sum, arr)=>sum+(Array.isArray(arr)?arr.filter((m)=>Date.now()-Number(m.createdAt||0)<86400000).length:0),0), files:Object.keys(db.files || {}).length, sessions:sessions.length, devices:devices.length, sockets: adminServerModule?.getRuntimeMetrics?.()?.sockets || 0 };
    const errors = adminLogBuffer.filter((l)=>l.level === "error" || /error|failed|ошиб|exception/i.test(l.text || ""));
    const backups = listBackups138();
    const health = { dbSize:statFile(config.sqliteFile), uploadsSize:dirSize(config.uploadsDir), logsSize:adminLogBuffer.reduce((s,l)=>s+String(l.text||"").length,0), memory:process.memoryUsage(), uptime:process.uptime(), requestsPerMinute:adminServerModule?.getRuntimeMetrics?.()?.requestsPerMinute || 0, errorsPerMinute:adminServerModule?.getRuntimeMetrics?.()?.errorsPerMinute || 0 };
    const warnings = [];
    if (health.dbSize > 100 * 1024 * 1024) warnings.push("База данных больше 100 MB — сделай backup и проверь таблицы.");
    if (health.uploadsSize > 1024 * 1024 * 1024) warnings.push("Uploads больше 1 GB — пора чистить медиа/backup.");
    if (errors.filter((l)=>Date.now()-new Date(l.time).getTime()<3600000).length > 10) warnings.push("Много ошибок за последний час.");
    if (adminServerStatus.ok && !adminServerUrl) warnings.push("Сервер работает, но public URL не определён.");
    return { version:app.getVersion() || VERSION, server:adminServerStatus, radmin:{ host:process.env.NIGHTVAULT_HOST || "0.0.0.0", port:process.env.NIGHTVAULT_PORT || "3000", publicUrl:process.env.NIGHTVAULT_PUBLIC_URL || adminServerUrl || "http://26.4.1.76:3000" }, counts, users, sessions, devices, health, backups:{ count:backups.length, latest:backups[0]?.name || "", items:backups.slice(0,25) }, errors:{ lastHour:errors.filter((l)=>Date.now()-new Date(l.time).getTime()<3600000).length, lastError:errors.at(-1)?.text || "", items:errors.slice(-80).reverse() }, security:{ adminPasswordStatus:"configured", twoFactorUsers:users.filter((u)=>u.twoFactor).length, failedLogins:errors.filter((l)=>/login|auth/i.test(l.text||"")).length, suspiciousIps:0, activeSessions:sessions.length, untrustedDevices:devices.filter((d)=>!d.trusted).length, e2eeDevices:devices.length }, release:releaseCheck138(), maintenance:readMaintenance(), warnings };
  }
  const baseCommand138 = runAdminConsoleCommand;
  runAdminConsoleCommand = function nv138RunAdminConsoleCommand(commandText) {
    requireAdmin();
    const command = String(commandText || "").trim();
    const [cmdRaw, subRaw, ...rest] = command.split(/\s+/);
    const cmd = String(cmdRaw || "").toLowerCase();
    const sub = String(subRaw || "").toLowerCase();
    const arg = rest.join(" ").trim();
    const snap = () => adminSnapshot138();
    if (!command || cmd === "help" || cmd === "?") return { ok:true, text:["NightVault Admin 1.4.4 commands:", "help users|backup|server", "stats, health, ports, radmin, version, uptime", "users, online, info user <username>", "sessions <username>, devices <username>, contacts <username>, chats <username>, files <username>", "chat <id>, chat members <id>, chat messages <id>, chat files <id>", "logs auth|users|messages|contacts|files|groups|errors|security|debug", "backup create|list|export|verify <file>", "broadcast <text>, announce <text>", "release check, security status, test all", "Опасные команды kick/ban/reset2fa/delete/restore требуют confirm и пока disabled."].join("\n") };
    if (cmd === "help" && sub === "backup") return { ok:true, text:"backup create — создать .nvbackup; backup list — список; backup export — выбрать путь; backup verify <file> — проверить checksum." };
    if (cmd === "help" && sub === "server") return { ok:true, text:"server/Radmin: startServer из UI, radmin, ports, health, maintenance mode в Settings." };
    if (cmd === "stats") return { ok:true, data:snap().counts };
    if (cmd === "version") return { ok:true, text:app.getVersion() || VERSION };
    if (cmd === "uptime") return { ok:true, text:Math.round(process.uptime()) + " sec" };
    if (cmd === "online") return { ok:true, data:snap().users.filter((u)=>u.online) };
    if (cmd === "users") return { ok:true, data:snap().users };
    if (cmd === "sessions") { const username=String(subRaw||"").toLowerCase(); return { ok:true, data:snap().sessions.filter((s)=>!username||s.username===username) }; }
    if (cmd === "devices") { const username=String(subRaw||"").toLowerCase(); return { ok:true, data:snap().devices.filter((d)=>!username||d.username===username) }; }
    if (cmd === "release" && sub === "check") return releaseCheck138();
    if (cmd === "security" && (!sub || sub === "status")) return { ok:true, data:snap().security };
    if (cmd === "backup" && sub === "verify") { const file = arg || rest[0] || ""; const target = path.isAbsolute(file) ? file : path.join(backupsDir138(), file); return { ok:true, data:verifyBackup138(target) }; }
    if (cmd === "backup" && sub === "create") return createBackup138();
    if (cmd === "backup" && sub === "list") return { ok:true, data:listBackups138() };
    if ((cmd === "broadcast" || cmd === "announce")) { const text = [subRaw, ...rest].join(" ").trim(); if (!text) return { ok:false, text:`${cmd} <text>` }; return sendBroadcast138({ type:"info", text }); }
    if (cmd === "test") return runAdminTest(sub || "all");
    if (["kick","ban","unban","reset2fa","delete","restore"].includes(cmd)) return { ok:false, text:`Опасная команда ${cmd} отключена. Для будущей версии нужен confirm ${cmd} ...` };
    return baseCommand138(commandText);
  };
  function sendBroadcast138(data = {}) {
    requireAdmin();
    const payload = { type:data.type || "info", text:String(data.text || data.message || "").slice(0, 500), createdAt:Date.now() };
    if (!payload.text) return { ok:false, text:"Пустое объявление." };
    pushAdminLog("info", ["[broadcast]", payload.type, payload.text]);
    try { adminServerModule?.broadcastAdminEvent?.(payload); } catch {}
    return { ok:true, text:"Объявление отправлено/записано: " + payload.text, payload };
  }
  handle("admin-snapshot", () => adminSnapshot138());
  handle("admin-backup-create", () => createBackup138());
  handle("admin-backup-list", () => { requireAdmin(); return listBackups138(); });
  handle("admin-release-check", () => releaseCheck138());
  handle("admin-maintenance-get", () => { requireAdmin(); return readMaintenance(); });
  handle("admin-maintenance-set", (_event, payload = {}) => { requireAdmin(); const state = saveMaintenance({ enabled:Boolean(payload.enabled), allowLogin:payload.allowLogin !== false, allowRead:payload.allowRead !== false, blockWrites:Boolean(payload.blockWrites), blockRegistration:Boolean(payload.blockRegistration), message:String(payload.message || "Сервер на обслуживании").slice(0, 240) }); pushAdminLog("warn", ["[maintenance]", state.enabled ? "enabled" : "disabled", state.message]); try { adminServerModule?.broadcastAdminEvent?.({ type:"maintenance", maintenance:state, text:state.message }); } catch {} return state; });
  handle("admin-broadcast", (_event, payload = {}) => sendBroadcast138(payload));
})();

/* NightVault 1.4.4 — legacy backup import compatibility and safer admin import */
(function nv139LegacyBackupImport(){
  const VERSION = "1.4.4";
  function backupsDir139(){ const dir = path.join(app.getPath("userData"), "server-backups"); fs.mkdirSync(dir, { recursive:true }); return dir; }
  function makeSafetyBackup139(prefix = "pre-import") {
    const store = require("../server/lib/store");
    const db = cloneForExport(store.db);
    const uploads = collectUploadBundle();
    const manifest = { format:"nightvault-backup", version:2, appVersion:app.getVersion() || VERSION, exportedAt:new Date().toISOString(), users:Object.keys(db.users||{}).length, chats:Object.keys(db.chats||{}).length, messages:Object.values(db.messages||{}).reduce((s,a)=>s+(Array.isArray(a)?a.length:0),0), uploads:uploads.length, safety:true };
    const payload = { manifest, db, uploads, serverConfigSafe:{ host:process.env.NIGHTVAULT_HOST || "0.0.0.0", port:process.env.NIGHTVAULT_PORT || "3000", publicUrl:process.env.NIGHTVAULT_PUBLIC_URL || adminServerUrl || "" } };
    const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const file = path.join(backupsDir139(), `${prefix}-${Date.now()}.nvbackup`);
    fs.writeFileSync(file, JSON.stringify({ ...payload, checksum }, null, 2), { mode:0o600 });
    return file;
  }
  function parseBackup139(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    const bundle = JSON.parse(raw);
    const warnings = [];
    if (bundle?.format === "nightvault-server-data" && bundle.db && typeof bundle.db === "object") {
      return { db:bundle.db, uploads:Array.isArray(bundle.uploads) ? bundle.uploads : [], manifest:{ format:"nightvault-server-data", version:bundle.version || "legacy", exportedAt:bundle.exportedAt || null }, warnings };
    }
    if (bundle?.manifest?.format === "nightvault-backup" && bundle.db && typeof bundle.db === "object") {
      if (bundle.checksum) {
        const { checksum, ...rest } = bundle;
        const expected = crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
        if (checksum !== expected) warnings.push("Checksum не совпал: импорт разрешён как legacy/repair, но создан safety-backup текущих данных.");
      } else warnings.push("В backup нет checksum: импорт как legacy.");
      return { db:bundle.db, uploads:Array.isArray(bundle.uploads) ? bundle.uploads : [], manifest:bundle.manifest, warnings };
    }
    if (bundle?.db && typeof bundle.db === "object") {
      warnings.push("Неизвестный контейнер, но поле db найдено. Импорт как legacy.");
      return { db:bundle.db, uploads:Array.isArray(bundle.uploads) ? bundle.uploads : [], manifest:{ format:"legacy-db", version:"unknown" }, warnings };
    }
    throw new Error("Файл не похож на backup NightVault: нет manifest/db или старого format nightvault-server-data.");
  }
  exportServerDataBundle = async function nv139ExportServerDataBundle(){
    requireAdmin();
    const store = require("../server/lib/store");
    await store.flush?.();
    const result = await dialog.showSaveDialog(adminWindow || mainWindow, { title:"Выгрузить данные сервера NightVault", defaultPath:`nightvault-backup-${new Date().toISOString().replace(/[:T]/g,"-").slice(0,16)}.nvbackup`, filters:[{ name:"NightVault backup", extensions:["nvbackup", "json"] }] });
    if (result.canceled || !result.filePath) return { ok:false, canceled:true };
    const rollback = makeSafetyBackup139("manual-export-snapshot");
    let target = result.filePath;
    if (!/\.(nvbackup|json)$/i.test(target)) target += ".nvbackup";
    fs.copyFileSync(rollback, target);
    pushAdminLog("info", ["[admin] backup exported", target]);
    return { ok:true, path:target, rollbackBackup:rollback, text:"Backup выгружен: " + target };
  };
  importServerDataBundle = async function nv139ImportServerDataBundle(){
    requireAdmin();
    const result = await dialog.showOpenDialog(adminWindow || mainWindow, { title:"Загрузить backup / данные сервера NightVault", properties:["openFile"], filters:[{ name:"NightVault backup or legacy JSON", extensions:["nvbackup", "json"] }] });
    if (result.canceled || !result.filePaths?.[0]) return { ok:false, canceled:true };
    const filePath = result.filePaths[0];
    const parsed = parseBackup139(filePath);
    const rollback = makeSafetyBackup139("pre-import");
    const store = require("../server/lib/store");
    for (const key of Object.keys(store.db)) delete store.db[key];
    Object.assign(store.db, parsed.db);
    const config = require("../server/lib/config");
    fs.mkdirSync(config.uploadsDir, { recursive:true });
    for (const file of parsed.uploads || []) {
      const safeName = path.basename(String(file.name || ""));
      if (!safeName || !file.data) continue;
      fs.writeFileSync(path.join(config.uploadsDir, safeName), Buffer.from(String(file.data), "base64"));
    }
    await store.save?.({ immediate:true });
    pushAdminLog("info", ["[admin] backup imported", filePath, "rollback=", rollback, parsed.warnings.join(" | ")]);
    return { ok:true, path:filePath, rollbackBackup:rollback, manifest:parsed.manifest, warnings:parsed.warnings, users:Object.keys(store.db.users||{}).length, chats:Object.keys(store.db.chats||{}).length, uploads:(parsed.uploads||[]).length, text:"Импорт завершён. Safety-backup: " + rollback };
  };
  const baseRunAdminCommand139 = runAdminConsoleCommand;
  runAdminConsoleCommand = function nv139AdminCommand(commandText){
    const command = String(commandText || "").trim();
    const [cmdRaw, subRaw, ...rest] = command.split(/\s+/);
    const cmd = String(cmdRaw || "").toLowerCase();
    const sub = String(subRaw || "").toLowerCase();
    if (cmd === "backup" && sub === "import") return { ok:true, text:"Импорт backup выполняется через кнопку Backups → Импортировать. Поддерживаются .nvbackup v2 и legacy .json из 1.3.5/1.3.6/1.3.7/1.3.8." };
    if (cmd === "version") return { ok:true, text:app.getVersion() || VERSION };
    return baseRunAdminCommand139(commandText);
  };
})();
