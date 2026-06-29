const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const ID_RE = /^(?:[a-z]+_)?[a-f0-9]{12,96}$/i;
const ALLOWED_REACTIONS = new Set([
  "👍",
  "👎",
  "❤️",
  "🔥",
  "😂",
  "🤣",
  "😮",
  "😢",
  "😭",
  "🎉",
  "✅",
  "🤔",
  "😍",
  "😡",
  "👏",
  "🙏",
  "💯",
  "⚡",
  "🌙",
  "💀",
]);

function text(value, max = 4000, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).normalize("NFKC").slice(0, max);
}

function username(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return USERNAME_RE.test(normalized) ? normalized : "";
}

function password(value) {
  const normalized = String(value || "");
  return normalized.length >= 10 && normalized.length <= 128 ? normalized : "";
}

function id(value) {
  const normalized = String(value || "");
  return ID_RE.test(normalized) ? normalized : "";
}

function stringArray(value, maxItems = 50, itemMax = 64) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => text(item, itemMax))
    .filter(Boolean);
}

function boolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function number(value, min, max, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function reaction(value) {
  const normalized = String(value || "");
  return ALLOWED_REACTIONS.has(normalized) ? normalized : "";
}

function mentions(value, maxItems = 20) {
  const textValue = String(value || "").toLowerCase();
  const found = new Set();
  for (const match of textValue.matchAll(/(^|\s)@([a-z0-9_]{3,32})\b/g)) {
    found.add(match[2]);
    if (found.size >= maxItems) break;
  }
  return [...found];
}

module.exports = {
  text,
  username,
  password,
  id,
  stringArray,
  boolean,
  number,
  reaction,
  mentions,
  USERNAME_RE,
  ALLOWED_REACTIONS,
};
