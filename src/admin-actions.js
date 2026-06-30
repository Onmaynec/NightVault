"use strict";

(function installNightVaultAdminActions147() {
  if (window.NVAdminActions147?.installed) return;
  const telemetry = { actions: [], errors: [] };

  function push(list, item) {
    list.push({ time: new Date().toISOString(), ...item });
    if (list.length > 100) list.shift();
  }

  function call(name, args = []) {
    const fn = window[name];
    if (typeof fn !== "function") throw new Error(`Admin action function not found: ${name}`);
    return fn(...args);
  }

  const actions = {
    "admin.logs.search": () => call("renderLogs"),
    "admin.logs.export": () => call("exportLogs"),
    "admin.logs.clearFilter": () => {
      const input = document.querySelector("#logSearch,[data-admin-log-search]");
      if (input) input.value = "";
      return call("renderLogs");
    },
    "admin.radmin.copyUrl": () => call("copyServerUrl"),
    "admin.radmin.refreshQr": () => call("renderRadminHelper"),
    "admin.debugPack": () => call("debugReport"),
    "admin.tests.run": () => call("runAdminTest"),
    "admin.modal.close": () => document.querySelector(".modal,.dialog,.sheet")?.remove(),
  };

  function dispatch(action, event, element) {
    try {
      const handler = actions[action] || window.AdminActions?.[action];
      if (typeof handler !== "function") throw new Error(`Admin UI action не найден: ${action}`);
      const result = handler(event, element);
      push(telemetry.actions, { action, ok: true });
      return result;
    } catch (error) {
      push(telemetry.errors, { action, message: error.message || String(error) });
      console.error("NightVault admin action failed", action, error);
      return undefined;
    }
  }

  function bind(root = document) {
    if (!root?.querySelectorAll) return;
    const nodes = [];
    if (root.nodeType === 1 && root.matches?.("[data-admin-action]")) nodes.push(root);
    nodes.push(...root.querySelectorAll("[data-admin-action]"));
    for (const node of nodes) {
      if (node.dataset.nvAdminAction147Bound === "1") continue;
      node.dataset.nvAdminAction147Bound = "1";
      node.addEventListener(node.dataset.adminActionEvent || "click", (event) => {
        event.preventDefault?.();
        dispatch(node.dataset.adminAction, event, node);
      });
    }
  }

  window.NVAdminActions147 = { installed: true, actions, telemetry, dispatch, bind };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bind(document), { once: true });
  else bind(document);
  try { new MutationObserver(() => bind(document)).observe(document.documentElement, { childList: true, subtree: true }); } catch {}
})();
