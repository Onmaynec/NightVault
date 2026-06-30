"use strict";
window.NV130Events = Object.freeze({
  version: "1.3.0",
  reconnectDelay(attempt) { return Math.min(30000, 500 * 2 ** Math.min(6, Number(attempt) || 0)); },
  typingTtlMs: 3500,
  heartbeatMs: 30000,
});
