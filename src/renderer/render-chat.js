"use strict";
window.NV130RenderChat = Object.freeze({
  version: "1.3.0",
  windowMessages(messages = [], limit = 260) {
    const safeLimit = Math.max(80, Math.min(1000, Number(limit) || 260));
    return (Array.isArray(messages) ? messages : []).slice(-safeLimit);
  },
  scrollAnchor(container) {
    if (!container) return { top: 0, height: 0 };
    return { top: container.scrollTop, height: container.scrollHeight };
  },
  restoreAnchor(container, anchor) {
    if (!container || !anchor) return;
    container.scrollTop = container.scrollHeight - anchor.height + anchor.top;
  },
  shouldAutoscroll(container, threshold = 180) {
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  },
});
