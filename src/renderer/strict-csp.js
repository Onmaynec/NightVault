"use strict";

(function installNightVaultStrictCspDiagnostics() {
  if (window.NVStrictCsp147?.installed) return;
  const state = {
    installed: true,
    strictCsp: true,
    violations: [],
    renderEvents: [],
    lastRenderReason: "",
    lastPartialRenderReason: "",
  };

  function pushViolation(event) {
    const item = {
      time: new Date().toISOString(),
      directive: event.violatedDirective || event.effectiveDirective || "",
      blockedURI: event.blockedURI || "",
      sourceFile: event.sourceFile || "",
      lineNumber: event.lineNumber || 0,
      sample: event.sample || "",
    };
    state.violations.push(item);
    if (state.violations.length > 50) state.violations.shift();
    window.NVActionTelemetry?.csp?.push?.(item);
    if (localStorage.nvDevCspToasts === "1" && typeof window.toast === "function") {
      window.toast("CSP заблокировал legacy UI действие. Приложите debug pack.");
    }
  }

  window.addEventListener("securitypolicyviolation", pushViolation);

  window.safeRender = window.safeRender || function safeRender(reason = "safeRender") {
    state.lastRenderReason = reason;
    state.renderEvents.push({ time: new Date().toISOString(), reason, kind: "full" });
    if (state.renderEvents.length > 100) state.renderEvents.shift();
    try {
      if (typeof window.render === "function") return window.render();
    } catch (error) {
      window.NVActionTelemetry?.error?.({ action: "render.safe", message: error.message || String(error), stack: String(error.stack || "").slice(0, 2000) });
      if (typeof window.toast === "function") window.toast("Ошибка обновления интерфейса: " + (error.message || error));
    }
    return undefined;
  };

  window.safePartialRender = window.safePartialRender || function safePartialRender(root = document, reason = "safePartialRender", renderFn = null) {
    state.lastPartialRenderReason = reason;
    state.renderEvents.push({ time: new Date().toISOString(), reason, kind: "partial" });
    if (state.renderEvents.length > 100) state.renderEvents.shift();
    try {
      const result = typeof renderFn === "function" ? renderFn(root) : undefined;
      window.nvBindPartial?.(root, reason);
      return result;
    } catch (error) {
      window.NVActionTelemetry?.error?.({ action: "render.partial", message: error.message || String(error), stack: String(error.stack || "").slice(0, 2000) });
      if (typeof window.toast === "function") window.toast("Ошибка частичного обновления: " + (error.message || error));
      return undefined;
    }
  };

  window.NVStrictCsp147 = state;
  window.nv147CspDebug = () => ({
    strictCsp: state.strictCsp,
    legacyInlineCount: document.querySelectorAll("[onclick],[oninput],[onchange],[onscroll],[ondrop],[oncontextmenu]").length,
    violations: state.violations.slice(-20),
    lastViolation: state.violations.at(-1) || null,
    lastAction: window.NVActionTelemetry?.lastAction || null,
    lastRenderReason: state.lastRenderReason,
    lastPartialRenderReason: state.lastPartialRenderReason,
  });
})();
