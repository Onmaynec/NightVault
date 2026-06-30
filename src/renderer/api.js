"use strict";

window.NVClientApi = Object.freeze({
  version: "1.0.9",
  defaultTimeoutMs: 20_000,
  uploadTimeoutMs: 120_000,
  isSafeHttpServer(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  },
  normalizeServer(value, fallback = "http://localhost:3000") {
    let next = String(value || "").trim() || fallback;
    if (!/^https?:\/\//i.test(next)) next = "http://" + next;
    try {
      const url = new URL(next);
      url.username = "";
      url.password = "";
      url.hash = "";
      url.pathname = url.pathname.replace(/\/+$/, "");
      return url.toString().replace(/\/+$/, "");
    } catch {
      return fallback;
    }
  },
});
