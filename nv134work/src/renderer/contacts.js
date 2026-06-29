"use strict";

window.NVContacts = Object.freeze({
  version: "1.0.9",
  statusLabel(status) {
    return {
      accepted: "В контактах",
      incoming: "Входящая заявка",
      outgoing: "Заявка отправлена",
      none: "Не в контактах",
      self: "Это вы",
    }[status || "none"] || "Не в контактах";
  },
  normalizeSearch(value) {
    return String(value || "").trim().toLowerCase().replace(/^@+/, "").slice(0, 32);
  },
});
