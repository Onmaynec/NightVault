"use strict";
window.NV130RenderProfile = Object.freeze({
  version: "1.3.0",
  safeAsset(value = "") {
    const ref = String(value || "");
    return ref.startsWith("/api/files/") || ref.startsWith("blob:") || ref.startsWith("data:image/") ? ref : "";
  },
  fallbackInitial(name = "?") { return (String(name || "?").trim()[0] || "?").toUpperCase(); },
});
