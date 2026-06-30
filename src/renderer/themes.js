"use strict";
window.NV130Themes = Object.freeze({
  version: "1.3.0",
  validateAccent(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")); },
  normalizeMotion(value) { return ["off", "calm", "balanced", "rich"].includes(value) ? value : "balanced"; },
});
