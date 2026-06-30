"use strict";
window.NV130Diagnostics = Object.freeze({
  version: "1.3.0",
  redact(value) {
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, val] of Object.entries(value)) out[key] = /token|secret|password|private|ciphertext/i.test(key) ? "[redacted]" : this.redact(val);
      return out;
    }
    return value;
  },
});
