"use strict";

function settingsFor(db, username) {
  const user = db.users?.[username] || {};
  const settings = user.notificationSettings || {};
  return {
    enabled: settings.enabled !== false,
    showText: settings.showText !== false,
    sound: settings.sound || "default",
    quietHours: settings.quietHours || null,
    chatMutes: settings.chatMutes || {},
  };
}

function updateSettings(db, username, patch = {}) {
  const user = db.users?.[username];
  if (!user) throw new Error("Пользователь не найден.");
  user.notificationSettings = { ...settingsFor(db, username), ...patch, updatedAt: Date.now() };
  return user.notificationSettings;
}

function notify(db, username, type, value = {}) {
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  const item = { id: `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, username, type, value, readAt: 0, createdAt: Date.now() };
  db.notifications.push(item);
  db.notifications = db.notifications.slice(-3000);
  return item;
}

function list(db, username, limit = 100) {
  return (db.notifications || []).filter((item) => item.username === username).slice(-Math.max(1, Math.min(500, Number(limit) || 100))).reverse();
}

function markRead(db, username, ids = []) {
  const set = new Set(ids.map(String));
  let count = 0;
  for (const item of db.notifications || []) {
    if (item.username === username && (!set.size || set.has(item.id)) && !item.readAt) { item.readAt = Date.now(); count += 1; }
  }
  return count;
}

module.exports = { settingsFor, updateSettings, notify, list, markRead };
