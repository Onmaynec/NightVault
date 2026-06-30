const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("./config");

function randomId(bytes = 18) {
  return crypto.randomBytes(bytes).toString("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function loadMasterKey() {
  const configured = String(process.env.NIGHTVAULT_MASTER_KEY || "").trim();
  if (configured) {
    if (/^[a-f0-9]{64}$/i.test(configured))
      return Buffer.from(configured, "hex");
    try {
      const decoded = Buffer.from(configured, "base64");
      if (decoded.length === 32) return decoded;
    } catch {}
    return crypto.createHash("sha256").update(configured).digest();
  }

  try {
    const existing = fs.readFileSync(config.masterKeyFile);
    if (existing.length === 32) return existing;
  } catch {}

  const generated = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(config.masterKeyFile), { recursive: true });
  fs.writeFileSync(config.masterKeyFile, generated, { mode: 0o600 });
  return generated;
}

const masterKey = loadMasterKey();

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decryptSecret(value) {
  if (!value) return "";
  const [ivRaw, tagRaw, ciphertextRaw] = String(value).split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("invalid secret");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    masterKey,
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const normalized = String(input)
    .toUpperCase()
    .replace(/=|\s|-/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of normalized) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totpCode(secret, timestamp = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, 6);
  return String(number).padStart(6, "0");
}

function verifyTotp(secret, code, window = 1) {
  const normalized = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let offset = -window; offset <= window; offset += 1) {
    if (totpCode(secret, Date.now() + offset * 30000) === normalized)
      return true;
  }
  return false;
}

function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return raw.slice(0, 5) + "-" + raw.slice(5);
  });
}

function sanitizeFilename(value) {
  const base = path.basename(String(value || "file"));
  return (
    base
      .normalize("NFKC")
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, " ")
      .slice(0, 160) || "file"
  );
}

function sniffMime(filePath, claimed = "", originalName = "") {
  const ext = path.extname(originalName).toLowerCase();
  const blockedExtensions = new Set([
    ".exe",
    ".msi",
    ".bat",
    ".cmd",
    ".com",
    ".scr",
    ".ps1",
    ".vbs",
    ".js",
    ".jar",
    ".app",
    ".dmg",
    ".html",
    ".htm",
    ".xhtml",
    ".svg",
    ".xml",
    ".mht",
    ".mhtml",
    ".dll",
    ".apk",
    ".deb",
    ".rpm",
    ".sh",
    ".php",
    ".py",
  ]);
  if (blockedExtensions.has(ext))
    return { blocked: true, mime: "application/octet-stream" };

  let bytes = Buffer.alloc(0);
  try {
    const fd = fs.openSync(filePath, "r");
    bytes = Buffer.alloc(32);
    const read = fs.readSync(fd, bytes, 0, bytes.length, 0);
    fs.closeSync(fd);
    bytes = bytes.subarray(0, read);
  } catch {}

  const starts = (...values) =>
    values.every((value, index) => bytes[index] === value);
  let mime = "application/octet-stream";
  if (starts(0x89, 0x50, 0x4e, 0x47)) mime = "image/png";
  else if (starts(0xff, 0xd8, 0xff)) mime = "image/jpeg";
  else if (bytes.subarray(0, 6).toString("ascii").startsWith("GIF8"))
    mime = "image/gif";
  else if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    mime = "image/webp";
  else if (bytes.subarray(0, 4).toString("ascii") === "%PDF")
    mime = "application/pdf";
  else if (starts(0x50, 0x4b, 0x03, 0x04)) mime = "application/zip";
  else if (bytes.subarray(4, 8).toString("ascii") === "ftyp")
    mime = "video/mp4";
  else if (starts(0x1a, 0x45, 0xdf, 0xa3)) {
    mime = String(claimed).startsWith("audio/") ? "audio/webm" : "video/webm";
  } else if (bytes.subarray(0, 4).toString("ascii") === "OggS")
    mime = "audio/ogg";
  else if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WAVE"
  )
    mime = "audio/wav";
  else if (
    bytes.subarray(0, 3).toString("ascii") === "ID3" ||
    starts(0xff, 0xfb)
  )
    mime = "audio/mpeg";
  else if (ext === ".txt" || ext === ".md") mime = "text/plain";

  if (mime === "application/octet-stream") {
    const safeClaimed = String(claimed || "").toLowerCase();
    if (/^(image|audio|video)\/[a-z0-9.+-]+$/.test(safeClaimed))
      mime = safeClaimed;
  }
  return { blocked: false, mime };
}

module.exports = {
  randomId,
  randomToken,
  sha256,
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  totpCode,
  verifyTotp,
  generateRecoveryCodes,
  sanitizeFilename,
  sniffMime,
};
