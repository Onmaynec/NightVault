const fs = require("fs");
const path = require("path");

const packageJson = require(path.join(__dirname, "../../package.json"));
const rootDir = path.join(__dirname, "../..");

function insideAsar(filePath) {
  return String(filePath || "").toLowerCase().includes(".asar");
}

function userWritableRuntimeDir() {
  const base =
    process.env.NIGHTVAULT_APPDATA_DIR ||
    process.env.APPDATA ||
    process.env.LOCALAPPDATA ||
    process.env.USERPROFILE ||
    process.cwd();
  return path.join(base, "NightVault", "server");
}

function defaultDataDir() {
  if (insideAsar(__dirname) || insideAsar(rootDir)) return userWritableRuntimeDir();
  return path.join(rootDir, "server", "runtime");
}

const dataDir = path.resolve(process.env.NIGHTVAULT_DATA_DIR || defaultDataDir());

fs.mkdirSync(dataDir, { recursive: true });

function intFromEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

const maxImageMb = intFromEnv("NIGHTVAULT_MAX_IMAGE_MB", 15, 1, 80);
const maxAudioMb = intFromEnv("NIGHTVAULT_MAX_AUDIO_MB", 30, 1, 120);
const maxVideoMb = intFromEnv("NIGHTVAULT_MAX_VIDEO_MB", 100, 1, 500);
const maxDocumentMb = intFromEnv("NIGHTVAULT_MAX_DOCUMENT_MB", 50, 1, 250);
const maxFileMb = intFromEnv(
  "NIGHTVAULT_MAX_FILE_MB",
  Math.max(100, maxImageMb, maxAudioMb, maxVideoMb, maxDocumentMb),
  1,
  500,
);

module.exports = {
  version: packageJson.version,
  rootDir,
  dataDir,
  dataFile: path.join(dataDir, "data.json"),
  sqliteFile: path.join(dataDir, "nightvault.sqlite3"),
  uploadsDir: path.join(dataDir, "uploads"),
  legacyUploadsDir: path.join(rootDir, "uploads"),
  masterKeyFile: path.join(dataDir, "master.key"),
  host: process.env.NIGHTVAULT_HOST || "127.0.0.1",
  port: intFromEnv("NIGHTVAULT_PORT", 3000, 1, 65535),
  maxJsonBytes: intFromEnv("NIGHTVAULT_MAX_JSON_MB", 1, 1, 8) * 1024 * 1024,
  maxFileBytes: maxFileMb * 1024 * 1024,
  maxAvatarBytes: 8 * 1024 * 1024,
  maxImageBytes: maxImageMb * 1024 * 1024,
  maxAudioBytes: maxAudioMb * 1024 * 1024,
  maxVideoBytes: maxVideoMb * 1024 * 1024,
  maxDocumentBytes: maxDocumentMb * 1024 * 1024,
  accessTtlMs: intFromEnv("NIGHTVAULT_ACCESS_MINUTES", 30, 5, 1440) * 60 * 1000,
  refreshTtlMs:
    intFromEnv("NIGHTVAULT_REFRESH_DAYS", 30, 1, 180) * 24 * 60 * 60 * 1000,
  tlsCertPath: process.env.NIGHTVAULT_TLS_CERT || "",
  tlsKeyPath: process.env.NIGHTVAULT_TLS_KEY || "",
  publicBaseUrl: (process.env.NIGHTVAULT_PUBLIC_URL || "").replace(/\/+$/, ""),
  corsOrigins: String(process.env.NIGHTVAULT_CORS_ORIGINS || "null")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
