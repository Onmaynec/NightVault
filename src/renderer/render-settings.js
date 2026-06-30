"use strict";
window.NV130RenderSettings = Object.freeze({
  version: "1.3.0",
  sections: ["overview", "profile", "appearance", "chat", "notifications", "security", "sync", "devices", "diagnostics", "developer"],
  validSection(value) { return this.sections.includes(value) ? value : "overview"; },
});
