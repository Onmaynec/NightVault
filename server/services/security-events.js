"use strict";

const { db, save } = require("../lib/store");
const { randomId } = require("../lib/security");

const MAX_SECURITY_EVENTS = 1000;

function recordSecurityEvent(type, details = {}) {
  db.securityEvents = Array.isArray(db.securityEvents) ? db.securityEvents : [];
  const event = {
    id: randomId(8),
    type: String(type || "security_event").slice(0, 80),
    createdAt: Date.now(),
    username: String(details.username || "").slice(0, 64),
    ip: String(details.ip || "").slice(0, 80),
    severity: String(details.severity || "info").slice(0, 16),
    message: String(details.message || "").slice(0, 240),
    meta: details.meta && typeof details.meta === "object" ? details.meta : {},
  };
  db.securityEvents.push(event);
  if (db.securityEvents.length > MAX_SECURITY_EVENTS) {
    db.securityEvents.splice(0, db.securityEvents.length - MAX_SECURITY_EVENTS);
  }
  save();
  return event;
}

function listSecurityEvents(username, limit = 80) {
  const normalized = String(username || "");
  return (db.securityEvents || [])
    .filter((event) => !event.username || event.username === normalized)
    .slice(-Math.max(1, Math.min(200, Number(limit) || 80)))
    .reverse();
}

module.exports = { recordSecurityEvent, listSecurityEvents };
