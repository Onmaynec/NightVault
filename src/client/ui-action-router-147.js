"use strict";

(function installNightVault147ActionRouter() {
  if (window.NV147ActionRouter?.installed) return;

  const MAX_TELEMETRY = 100;
  const telemetry = (window.NVActionTelemetry = window.NVActionTelemetry || {
    actions: [],
    errors: [],
    binds: [],
    csp: [],
    lastAction: null,
    push(entry) {
      const item = { time: new Date().toISOString(), ...entry };
      this.actions.push(item);
      this.lastAction = item;
      if (this.actions.length > MAX_TELEMETRY) this.actions.splice(0, this.actions.length - MAX_TELEMETRY);
      return item;
    },
    error(entry) {
      const item = { time: new Date().toISOString(), ...entry };
      this.errors.push(item);
      if (this.errors.length > MAX_TELEMETRY) this.errors.splice(0, this.errors.length - MAX_TELEMETRY);
      return item;
    },
  });

  function toast(message) {
    if (typeof window.toast === "function") return window.toast(String(message || ""));
    console.warn("NightVault UI:", message);
  }

  function safeCall(name, args = [], element = null) {
    const fn = window[name];
    if (typeof fn !== "function") throw new Error(`UI action function not found: ${name}`);
    return fn.apply(element || window, args);
  }

  function valueFrom(element) {
    if (!element) return "";
    if (element.type === "checkbox") return Boolean(element.checked);
    return element.value ?? element.dataset.actionValue ?? element.dataset.value ?? "";
  }

  function parsePayload(element) {
    const data = { ...(element?.dataset || {}) };
    if (data.actionJson) {
      try {
        return { ...data, json: JSON.parse(data.actionJson) };
      } catch (error) {
        throw new Error(`Некорректный data-action-json: ${error.message}`);
      }
    }
    return data;
  }

  const actions = {
    "modal.close": () => document.querySelector(".modal,.dialog,.sheet,.ctx,.emojiPanel")?.remove(),
    "panel.close": () => document.querySelector(".sidePanel,.rightPanel,.drawer")?.remove(),
    "context.close": () => document.querySelector(".ctx")?.remove(),
    "emoji.close": () => (typeof window.closeEmojiPanel === "function" ? window.closeEmojiPanel() : document.querySelector(".emojiPanel")?.remove()),
    "overlay.closeAll": () => document.querySelectorAll(".ctx,.emojiPanel,.modal,.dialog,.sheet").forEach((node) => node.remove()),
    "render.safe": (_event, element) => window.safeRender?.(element?.dataset.reason || "ui-action") || safeCall("render"),
    "settings.save": () => safeCall("saveSettings"),
    "settings.server.save": () => safeCall("saveServerConnection"),
    "settings.connection.check": () => safeCall("checkServerConnection"),
    "settings.section": (_event, element) => {
      const section = element?.dataset.section || element?.dataset.actionValue || valueFrom(element);
      if (window.S) {
        window.S.settingsSection = section || window.S.settingsSection || "overview";
        localStorage.nvSettingsSection = window.S.settingsSection;
      }
      return window.safeRender?.("settings.section") || safeCall("render");
    },
    "theme.set": (_event, element) => {
      if (window.S) window.S.theme = String(valueFrom(element) || window.S.theme || "crimson");
      if (window.applyTheme) return window.applyTheme();
      return window.safeRender?.("theme.set") || safeCall("render");
    },
    "contacts.filter": (_event, element) => {
      if (window.S) window.S.contactsFilter = String(valueFrom(element) || element?.dataset.filter || "all");
      if (typeof window.nv144RenderContactsFilterOnly === "function") return window.nv144RenderContactsFilterOnly();
      return window.safeRender?.("contacts.filter") || safeCall("render");
    },
    "profile.avatar.pick": () => safeCall("changeAvatar"),
    "profile.banner.pick": () => safeCall("changeBanner"),
    "profile.save": () => safeCall("saveProfile"),
    "e2ee.health.open": () => safeCall("openE2eeTrust"),
    "e2ee.resync": () => safeCall("resyncE2eeDevice"),
    "e2ee.recovery.explain": () => toast("Локальный E2EE cache помогает только уже расшифрованным сообщениям. Полный recovery bundle будет отдельной функцией."),
    "backup.export": () => safeCall("exportBackup"),
    "backup.import": () => safeCall("importBackup"),
    "backup.debugPack": () => safeCall("collectDebugReport"),
    "voice.start": () => safeCall("startVoice"),
    "voice.stop": () => safeCall("stopVoice"),
    "voice.cancel": () => safeCall("cancelVoice"),
    "voice.testMic": () => safeCall("nv144TestMicrophone"),
    "voice.refreshDevices": () => safeCall("nv144RefreshMicrophones"),
  };

  function register(name, handler) {
    if (!name || typeof handler !== "function") throw new Error("Invalid UI action registration");
    actions[name] = handler;
  }

  function dispatch(action, event, element) {
    const started = performance.now();
    const source = element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}` : "unknown";
    try {
      if (!action) throw new Error("Пустое UI action имя.");
      const handler = actions[action] || window.NVActions?.[action];
      if (typeof handler !== "function") throw new Error(`UI action не найден: ${action}`);
      const payload = parsePayload(element);
      const result = handler(event, element, payload);
      telemetry.push({ action, source, ok: true, durationMs: Math.round(performance.now() - started) });
      return result;
    } catch (error) {
      telemetry.push({ action, source, ok: false, durationMs: Math.round(performance.now() - started), error: error.message || String(error) });
      telemetry.error({ action, source, message: error.message || String(error), stack: String(error.stack || "").slice(0, 2000) });
      if (typeof window.__nvHandleInlineError === "function") window.__nvHandleInlineError(error);
      else toast("Ошибка действия интерфейса: " + (error.message || error));
      return undefined;
    }
  }

  function bind(root = document, reason = "manual") {
    if (!root?.querySelectorAll) return { bound: 0 };
    const nodes = [];
    if (root.nodeType === 1 && root.matches?.("[data-action]")) nodes.push(root);
    nodes.push(...root.querySelectorAll("[data-action]"));
    let bound = 0;
    for (const node of nodes) {
      if (node.dataset.nvRouter147Bound === "1") continue;
      node.dataset.nvRouter147Bound = "1";
      const eventName = node.dataset.actionEvent || (node.tagName === "INPUT" || node.tagName === "SELECT" || node.tagName === "TEXTAREA" ? "change" : "click");
      node.addEventListener(eventName, (event) => {
        if (node.dataset.actionPrevent !== "0") event.preventDefault?.();
        if (node.dataset.actionStop === "1") event.stopPropagation?.();
        dispatch(node.dataset.action, event, node);
      });
      bound += 1;
    }
    telemetry.binds.push({ time: new Date().toISOString(), reason, bound });
    if (telemetry.binds.length > 100) telemetry.binds.shift();
    return { bound };
  }

  let pendingBind = false;
  function scheduleBind(root = document, reason = "mutation") {
    if (pendingBind) return;
    pendingBind = true;
    setTimeout(() => {
      pendingBind = false;
      try { bind(root, reason); } catch (error) { telemetry.error({ action: "bind", message: error.message || String(error) }); }
    }, 25);
  }

  window.NV147ActionRouter = { installed: true, actions, register, dispatch, bind, scheduleBind };
  window.NVActions = window.NVActions || {};
  window.nvBindPartial = function nvBindPartial(root = document, reason = "partial") {
    const result = bind(root, reason);
    try { window.NVActionBridge?.bind?.(root); } catch (error) { telemetry.error({ action: "legacy.bind", message: error.message || String(error) }); }
    return result;
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bind(document, "domcontentloaded"), { once: true });
  else bind(document, "initial");

  const observer = new MutationObserver((records) => {
    let count = 0;
    for (const record of records) count += record.addedNodes?.length || 0;
    if (count > 500) console.warn("NightVault 1.4.7 UI bind batch is large:", count);
    scheduleBind(document, "mutation");
  });
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch {}

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dispatch("overlay.closeAll", event, document.body);
  });
})();
