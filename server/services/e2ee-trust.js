"use strict";

const crypto = require("crypto");

function fingerprintForPublicKey(key) {
  const payload = JSON.stringify(key || {}, Object.keys(key || {}).sort());
  const hex = crypto.createHash("sha256").update(payload).digest("hex");
  return hex.match(/.{1,4}/g).slice(0, 12).join(" ").toUpperCase();
}

function safetyNumberForChat(chat, users) {
  const parts = (chat?.members || [])
    .flatMap((username) => Object.values(users?.[username]?.e2eeDevices || {}).map((device) => `${username}:${device.id}:${fingerprintForPublicKey(device.publicKey)}`))
    .sort();
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").match(/.{1,5}/g).slice(0, 12).join(" ");
}

function trustStore(db, username) {
  db.trustedDevices = db.trustedDevices && typeof db.trustedDevices === "object" ? db.trustedDevices : {};
  db.trustedDevices[username] = db.trustedDevices[username] && typeof db.trustedDevices[username] === "object" ? db.trustedDevices[username] : {};
  return db.trustedDevices[username];
}

function listTrustedDevices(db, username) {
  const user = db.users?.[username];
  const store = trustStore(db, username);
  return Object.values(user?.e2eeDevices || {}).map((device) => {
    const fp = fingerprintForPublicKey(device.publicKey);
    const trusted = store[device.id];
    return { id: device.id, username, device: device.device || "NightVault device", fingerprint: fp, trusted: Boolean(trusted?.trusted), confirmedAt: trusted?.confirmedAt || 0, lastSeenAt: device.lastSeenAt || 0 };
  });
}

function setTrust(db, username, deviceId, trusted) {
  const user = db.users?.[username];
  if (!user?.e2eeDevices?.[deviceId]) throw new Error("Устройство не найдено.");
  const store = trustStore(db, username);
  store[deviceId] = { deviceId, trusted: Boolean(trusted), fingerprint: fingerprintForPublicKey(user.e2eeDevices[deviceId].publicKey), confirmedAt: Date.now() };
  db.keyEvents = Array.isArray(db.keyEvents) ? db.keyEvents : [];
  db.keyEvents.push({ id: crypto.randomBytes(12).toString("hex"), username, deviceId, type: trusted ? "trusted" : "untrusted", createdAt: Date.now() });
  return store[deviceId];
}

function rotateDeviceKey(db, username, deviceId, publicKey) {
  const user = db.users?.[username];
  if (!user?.e2eeDevices?.[deviceId]) throw new Error("Устройство не найдено.");
  const previous = fingerprintForPublicKey(user.e2eeDevices[deviceId].publicKey);
  const next = fingerprintForPublicKey(publicKey);
  user.e2eeDevices[deviceId].publicKey = publicKey;
  user.e2eeDevices[deviceId].lastSeenAt = Date.now();
  const store = trustStore(db, username);
  delete store[deviceId];
  db.keyEvents = Array.isArray(db.keyEvents) ? db.keyEvents : [];
  db.keyEvents.push({ id: crypto.randomBytes(12).toString("hex"), username, deviceId, type: "key_rotated", previous, next, createdAt: Date.now() });
  return { previous, next, trusted: false };
}

module.exports = { fingerprintForPublicKey, safetyNumberForChat, listTrustedDevices, setTrust, rotateDeviceKey };
