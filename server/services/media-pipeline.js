"use strict";

const crypto = require("crypto");
const fs = require("fs");

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function classifyForThumbnail(mime = "") {
  if (String(mime).startsWith("image/")) return "image";
  if (String(mime).startsWith("video/")) return "video";
  if (String(mime).startsWith("audio/")) return "audio";
  return "document";
}

function makePlaceholder(file) {
  const seed = crypto.createHash("sha1").update(`${file.id}:${file.mime}:${file.size}`).digest("hex");
  return { kind: classifyForThumbnail(file.mime), blurhash: seed.slice(0, 24), dominant: `#${seed.slice(0, 6)}` };
}

function enrichMediaFile(file, filePath, db) {
  const hash = sha256File(filePath);
  const placeholder = makePlaceholder(file);
  file.hash = hash;
  file.placeholder = placeholder;
  file.deduplicated = false;
  db.mediaRefs = db.mediaRefs && typeof db.mediaRefs === "object" ? db.mediaRefs : {};
  const duplicate = Object.values(db.files || {}).find((candidate) => candidate.id !== file.id && candidate.hash === hash);
  if (duplicate) file.duplicateOf = duplicate.id;
  db.mediaRefs[file.id] = { fileId: file.id, hash, thumb: placeholder.blurhash, refs: 0, value: { placeholder, duplicateOf: file.duplicateOf || "" }, updatedAt: Date.now() };
  return file;
}

function cleanupOrphanFiles(db, unlinkFile) {
  const referenced = new Set();
  for (const user of Object.values(db.users || {})) {
    for (const value of [user.avatar, user.banner]) {
      const id = String(value || "").split("/api/files/").pop();
      if (id) referenced.add(id);
    }
  }
  for (const messages of Object.values(db.messages || {})) for (const message of messages || []) {
    if (message.attachment?.id) referenced.add(message.attachment.id);
  }
  const removed = [];
  for (const [id, file] of Object.entries(db.files || {})) {
    if (file.kind === "pending" && !referenced.has(id) && Date.now() - Number(file.createdAt || 0) > 24 * 60 * 60 * 1000) {
      delete db.files[id];
      delete db.mediaRefs?.[id];
      removed.push(id);
      try { unlinkFile?.(id); } catch {}
    }
  }
  return removed;
}

module.exports = { sha256File, classifyForThumbnail, makePlaceholder, enrichMediaFile, cleanupOrphanFiles };
