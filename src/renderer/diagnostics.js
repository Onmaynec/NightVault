"use strict";

window.NVDiagnostics = Object.freeze({
  version: "1.0.9",
  bootTimeoutMs: 7000,
  maxClientErrorText: 1200,
  summarize(error) {
    const message = String(error?.message || error || "Неизвестная ошибка").slice(0, 1200);
    const stack = String(error?.stack || "").slice(0, 2400);
    return { message, stack, time: Date.now(), source: "renderer" };
  },
});
