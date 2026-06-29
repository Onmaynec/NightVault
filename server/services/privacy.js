"use strict";

const VISIBILITY = new Set(["all", "contacts", "nobody"]);
const PRESENCE_MODES = new Set(["online", "recently", "hidden"]);

function normalizeVisibility(value, fallback = "all") {
  return VISIBILITY.has(value) ? value : fallback;
}

function normalizePresenceMode(value, fallback = "online") {
  return PRESENCE_MODES.has(value) ? value : fallback;
}

function normalizePrivacy(input = {}, fallback = {}) {
  const current = fallback || {};
  return {
    avatar: normalizeVisibility(input.avatar, current.avatar || "all"),
    lastSeen: normalizeVisibility(input.lastSeen, current.lastSeen || "all"),
    status: normalizeVisibility(input.status, current.status || "all"),
    presenceMode: normalizePresenceMode(
      input.presenceMode,
      current.presenceMode || "online",
    ),
  };
}

function areContacts(db, first, second) {
  if (!first || !second || first === second) return true;
  const direct = db.contacts?.[first]?.[second]?.status === "accepted";
  const reverse = db.contacts?.[second]?.[first]?.status === "accepted";
  if (direct && reverse) return true;
  return Object.values(db.chats || {}).some(
    (chat) =>
      chat.type === "private" &&
      Array.isArray(chat.members) &&
      chat.members.includes(first) &&
      chat.members.includes(second),
  );
}

function canViewProfileField(db, viewer, user, field) {
  if (!user) return false;
  if (!viewer || viewer === user.username) return true;
  const privacy = normalizePrivacy(user.privacy || {});
  const mode = privacy[field] || "all";
  if (mode === "all") return true;
  if (mode === "contacts") return areContacts(db, viewer, user.username);
  return false;
}

function statusForUser(db, sockets, user, viewer, timestamp = Date.now()) {
  const privacy = normalizePrivacy(user?.privacy || {});
  if (!user || !canViewProfileField(db, viewer, user, "status")) {
    return { status: "hidden", statusText: "скрыт", lastSeen: 0 };
  }
  if (privacy.presenceMode === "hidden") {
    return { status: "hidden", statusText: "скрыт", lastSeen: 0 };
  }
  const online = Boolean(sockets?.get(user.username)?.size);
  const lastSeenVisible = canViewProfileField(db, viewer, user, "lastSeen");
  const lastSeen = lastSeenVisible ? user.lastSeen || 0 : 0;
  if (online && privacy.presenceMode === "online") {
    return { status: "online", statusText: "в сети", lastSeen };
  }
  const recent = lastSeen && timestamp - lastSeen < 15 * 60 * 1000;
  return {
    status: recent ? "recently" : "offline",
    statusText: recent ? "был недавно" : "был давно",
    lastSeen,
  };
}

module.exports = {
  VISIBILITY,
  PRESENCE_MODES,
  normalizePrivacy,
  canViewProfileField,
  statusForUser,
  areContacts,
};
