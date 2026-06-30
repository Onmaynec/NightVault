"use strict";
window.NV130Files = Object.freeze({
  version: "1.3.0",
  maxChunkBytes: 2 * 1024 * 1024,
  imageQuality: 0.86,
  classify(file) {
    const type = String(file?.type || "");
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return "document";
  },
  canResume(file) { return Number(file?.size || 0) > this.maxChunkBytes; },
});
