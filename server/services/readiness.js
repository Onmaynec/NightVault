"use strict";

function count(value) {
  return Object.keys(value || {}).length;
}

function serviceStatus(ok, label, details = {}) {
  return { ok: Boolean(ok), label, ...details };
}

function collectReadinessReport(db, config, options = {}) {
  const users = count(db.users);
  const chats = count(db.chats);
  const files = count(db.files);
  const contacts = Object.values(db.contacts || {}).reduce(
    (sum, book) => sum + Object.keys(book || {}).length,
    0,
  );
  const securityEvents = Array.isArray(db.securityEvents)
    ? db.securityEvents.length
    : 0;

  const checks = {
    version: serviceStatus(Boolean(config.version), "Версия приложения определена", {
      value: config.version,
    }),
    database: serviceStatus(Number(db.schemaVersion || 0) >= 11 && db.featureFlags?.sqliteReady, "SQLite-схема готова к 1.1.2", {
      schemaVersion: db.schemaVersion || 0,
      sqliteReady: Boolean(db.featureFlags?.sqliteReady),
    }),
    contacts: serviceStatus(Boolean(db.contacts), "Контакты доступны как отдельная подсистема", {
      entries: contacts,
    }),
    files: serviceStatus(Boolean(db.files), "Файловый индекс доступен", { files }),
    securityLog: serviceStatus(Array.isArray(db.securityEvents), "Журнал безопасности доступен", {
      events: securityEvents,
    }),
    transport: serviceStatus(
      Boolean(config.tlsCertPath && config.tlsKeyPath) || config.host === "127.0.0.1",
      "Транспорт безопасен для локального режима или TLS",
      { host: config.host, tls: Boolean(config.tlsCertPath && config.tlsKeyPath) },
    ),
    e2ee: serviceStatus(Boolean(db.featureFlags?.e2eeReady), "E2EE key layer активен", {
      devices: Object.values(db.users || {}).reduce((sum, user) => sum + Object.keys(user.e2eeDevices || {}).length, 0),
    }),
    syncEngine: serviceStatus(Boolean(db.featureFlags?.syncEngineReady), "Sync engine активен", {
      events: Array.isArray(db.syncEvents) ? db.syncEvents.length : 0,
    }),
  };

  const failed = Object.values(checks).filter((item) => !item.ok).length;
  return {
    ok: failed === 0,
    failed,
    version: config.version,
    generatedAt: Date.now(),
    counters: { users, chats, files, contacts, securityEvents },
    checks,
    exposePrivate: Boolean(options.private),
  };
}

module.exports = { collectReadinessReport };
