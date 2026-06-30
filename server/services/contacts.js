"use strict";

const STATUSES = new Set(["incoming", "outgoing", "accepted"]);

function ensureContactStore(db) {
  db.contacts = db.contacts && typeof db.contacts === "object" ? db.contacts : {};
  for (const username of Object.keys(db.users || {})) {
    db.contacts[username] = db.contacts[username] && typeof db.contacts[username] === "object" ? db.contacts[username] : {};
  }
  return db.contacts;
}

function cleanText(value, max = 120) {
  return String(value || "").normalize("NFKC").trim().slice(0, max);
}

function normalizeContactEntry(entry = {}, fallbackStatus = "accepted") {
  const status = STATUSES.has(entry.status) ? entry.status : fallbackStatus;
  const timestamp = Number(entry.updatedAt || entry.createdAt || Date.now());
  return {
    status,
    alias: cleanText(entry.alias, 64),
    note: cleanText(entry.note, 240),
    favorite: Boolean(entry.favorite),
    createdAt: Number(entry.createdAt || timestamp),
    updatedAt: timestamp,
  };
}

function migrateContacts(db) {
  ensureContactStore(db);
  for (const [owner, book] of Object.entries(db.contacts || {})) {
    if (!db.users[owner]) {
      delete db.contacts[owner];
      continue;
    }
    for (const [target, entry] of Object.entries(book || {})) {
      if (!db.users[target] || target === owner) {
        delete book[target];
        continue;
      }
      book[target] = normalizeContactEntry(entry, entry?.status || "accepted");
    }
  }
}

function getEntry(db, owner, target) {
  ensureContactStore(db);
  return db.contacts?.[owner]?.[target] || null;
}

function getRelationship(db, owner, target) {
  if (!owner || !target) return "none";
  if (owner === target) return "self";
  const entry = getEntry(db, owner, target);
  return entry?.status || "none";
}

function areRealContacts(db, first, second) {
  if (!first || !second || first === second) return true;
  return getRelationship(db, first, second) === "accepted";
}

function setEntry(db, owner, target, entry) {
  ensureContactStore(db);
  db.contacts[owner] = db.contacts[owner] || {};
  db.contacts[owner][target] = normalizeContactEntry(entry, entry.status);
  return db.contacts[owner][target];
}

function removeEntries(db, first, second) {
  ensureContactStore(db);
  if (db.contacts[first]) delete db.contacts[first][second];
  if (db.contacts[second]) delete db.contacts[second][first];
}

function sendContactRequest(db, from, to, timestamp = Date.now()) {
  if (from === to) return { ok: false, error: "self" };
  ensureContactStore(db);
  const existing = getRelationship(db, from, to);
  if (existing === "accepted") return { ok: true, status: "accepted", changed: false };
  const reverse = getRelationship(db, to, from);
  if (existing === "incoming" || reverse === "outgoing") {
    return acceptContactRequest(db, from, to, timestamp);
  }
  setEntry(db, from, to, { ...(getEntry(db, from, to) || {}), status: "outgoing", createdAt: getEntry(db, from, to)?.createdAt || timestamp, updatedAt: timestamp });
  setEntry(db, to, from, { ...(getEntry(db, to, from) || {}), status: "incoming", createdAt: getEntry(db, to, from)?.createdAt || timestamp, updatedAt: timestamp });
  return { ok: true, status: "outgoing", changed: true };
}

function acceptContactRequest(db, owner, requester, timestamp = Date.now()) {
  ensureContactStore(db);
  const ownerEntry = getEntry(db, owner, requester);
  const requesterEntry = getEntry(db, requester, owner);
  if (!ownerEntry && !requesterEntry) return { ok: false, error: "not_found" };
  setEntry(db, owner, requester, { ...(ownerEntry || {}), status: "accepted", createdAt: ownerEntry?.createdAt || timestamp, updatedAt: timestamp });
  setEntry(db, requester, owner, { ...(requesterEntry || {}), status: "accepted", createdAt: requesterEntry?.createdAt || timestamp, updatedAt: timestamp });
  return { ok: true, status: "accepted", changed: true };
}

function declineContactRequest(db, owner, requester) {
  ensureContactStore(db);
  const had = Boolean(getEntry(db, owner, requester) || getEntry(db, requester, owner));
  removeEntries(db, owner, requester);
  return { ok: true, changed: had };
}

function updateContactMeta(db, owner, target, patch = {}, timestamp = Date.now()) {
  const entry = getEntry(db, owner, target);
  if (!entry || entry.status !== "accepted") return { ok: false, error: "not_contact" };
  const next = {
    ...entry,
    alias: patch.alias !== undefined ? cleanText(patch.alias, 64) : entry.alias,
    note: patch.note !== undefined ? cleanText(patch.note, 240) : entry.note,
    favorite: patch.favorite !== undefined ? Boolean(patch.favorite) : Boolean(entry.favorite),
    updatedAt: timestamp,
  };
  setEntry(db, owner, target, next);
  return { ok: true, contact: getEntry(db, owner, target) };
}

function listContacts(db, owner, viewer, safeUser) {
  ensureContactStore(db);
  const result = { accepted: [], incoming: [], outgoing: [] };
  for (const [target, entry] of Object.entries(db.contacts[owner] || {})) {
    const user = db.users?.[target];
    if (!user || !STATUSES.has(entry.status)) continue;
    result[entry.status].push({
      user: safeUser(user, viewer || owner),
      status: entry.status,
      alias: entry.alias || "",
      note: entry.note || "",
      favorite: Boolean(entry.favorite),
      createdAt: entry.createdAt || 0,
      updatedAt: entry.updatedAt || 0,
    });
  }
  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return String(a.alias || a.user.displayName).localeCompare(String(b.alias || b.user.displayName), "ru");
    });
  }
  return result;
}

module.exports = {
  STATUSES,
  ensureContactStore,
  migrateContacts,
  normalizeContactEntry,
  getRelationship,
  areRealContacts,
  sendContactRequest,
  acceptContactRequest,
  declineContactRequest,
  updateContactMeta,
  removeEntries,
  listContacts,
};
