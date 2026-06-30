"use strict";

(function installNightVaultActionBridge() {
  const ATTRS = [
    "onclick",
    "onchange",
    "oninput",
    "onscroll",
    "oncontextmenu",
    "ondblclick",
    "ondragover",
    "ondrop",
    "onmousedown",
    "onmouseup",
    "ontouchstart",
    "ontouchend",
  ];

  const metrics = {
    version: "1.4.6",
    scanned: 0,
    bound: 0,
    errors: 0,
    lastError: "",
    lastAction: "",
    byAttr: {},
  };

  function eventName(attr) {
    return attr.slice(2);
  }

  function parseArg(value, event) {
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    if (raw === "event") return event;
    if (raw === "this") return event?.currentTarget;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    const quoted = raw.match(/^["']([\s\S]*)["']$/);
    if (quoted) return quoted[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
    return raw;
  }

  function splitArgs(args) {
    const out = [];
    let current = "";
    let quote = "";
    let depth = 0;
    for (let i = 0; i < args.length; i += 1) {
      const char = args[i];
      if (quote) {
        current += char;
        if (char === quote && args[i - 1] !== "\\") quote = "";
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        current += char;
        continue;
      }
      if (char === "(" || char === "[" || char === "{") depth += 1;
      if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
      if (char === "," && depth === 0) {
        out.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) out.push(current.trim());
    return out;
  }

  function assignLocalStorage(statement) {
    const match = statement.match(/^localStorage\.([a-zA-Z0-9_$]+)\s*=\s*([\s\S]+)$/);
    if (!match) return false;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    // NightVault 1.4.4 optional-inline compatibility: support old toggle expressions left by previous patches.
    const toggle = value.match(/^localStorage\.([a-zA-Z0-9_$]+)===['"]1['"]\?['"]0['"]:['"]1['"]$/);
    if (toggle && toggle[1] === key) localStorage[key] = localStorage[key] === "1" ? "0" : "1";
    else localStorage[key] = String(parseArg(value));
    return true;
  }

  function assignState(statement) {
    const match = statement.match(/^S\.([a-zA-Z0-9_$]+)\s*=\s*([\s\S]+)$/);
    if (!match || !window.S) return false;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value === `!S.${key}`) window.S[key] = !window.S[key];
    else if (value === "true") window.S[key] = true;
    else if (value === "false") window.S[key] = false;
    else if (value === "null") window.S[key] = null;
    else if (/^["']/.test(value)) window.S[key] = parseArg(value);
    else if (/^-?\d+(?:\.\d+)?$/.test(value)) window.S[key] = Number(value);
    else window.S[key] = value;
    return true;
  }

  function routeDataAction(element, event) {
    const action = element?.dataset?.action || "";
    if (!action) return false;
    metrics.lastAction = `data-action:${action}`;
    if (window.NVUIActionRouter?.run) {
      window.NVUIActionRouter.run(action, { event, element, action });
      return true;
    }
    if (window.NvUiActions?.run) {
      window.NvUiActions.run(action, { event, element, action });
      return true;
    }
    return false;
  }

  function runStatement(statement, event, element) {
    const code = statement.trim();
    if (!code) return;
    metrics.lastAction = code.slice(0, 160);
    if (code === "event.stopPropagation()") return event.stopPropagation();
    if (code === "event.preventDefault()") return event.preventDefault();
    if (code === "document.querySelector('.ctx').remove()" || code === "document.querySelector('.ctx')?.remove()") return document.querySelector(".ctx")?.remove();
    if (code === 'document.querySelector(".ctx").remove()' || code === 'document.querySelector(".ctx")?.remove()') return document.querySelector(".ctx")?.remove();
    if (code === "document.querySelector('.emojiPanel').remove()" || code === "document.querySelector('.emojiPanel')?.remove()") return document.querySelector(".emojiPanel")?.remove();
    if (code === 'document.querySelector(".emojiPanel").remove()' || code === 'document.querySelector(".emojiPanel")?.remove()') return document.querySelector(".emojiPanel")?.remove();
    if (code === "closeEmojiPanel()" && typeof window.closeEmojiPanel === "function") return window.closeEmojiPanel();
    if (assignLocalStorage(code)) return;
    if (assignState(code)) return;
    const optionalCall = code.match(/^([a-zA-Z_$][\w$]*)\?\.\((.*)\)$/);
    if (optionalCall) {
      const fn = window[optionalCall[1]];
      if (typeof fn === "function") {
        const args = splitArgs(optionalCall[2]).map((arg) => parseArg(arg, event));
        return fn.apply(element, args);
      }
      return;
    }
    const call = code.match(/^([a-zA-Z_$][\w$]*)\((.*)\)$/);
    if (call) {
      const fn = window[call[1]];
      if (typeof fn === "function") {
        const args = splitArgs(call[2]).map((arg) => parseArg(arg, event));
        return fn.apply(element, args);
      }
    }
    throw new Error("Неподдержанное UI-действие: " + code.slice(0, 80));
  }

  function runInlineAction(element, event, code) {
    try {
      if (routeDataAction(element, event)) return;
      for (const statement of String(code || "").split(";")) runStatement(statement, event, element);
    } catch (error) {
      metrics.errors += 1;
      metrics.lastError = error?.message || String(error);
      if (typeof window.__nvHandleInlineError === "function") window.__nvHandleInlineError(error);
      else console.error(error);
    }
  }

  function bindPartial(root = document, reason = "") {
    try {
      window.NVActionBridge?.bind(root);
      return true;
    } catch (error) {
      metrics.errors += 1;
      metrics.lastError = `bindPartial ${reason}: ${error?.message || error}`;
      console.error("NightVault bindPartial failed", reason, error);
      try { window.toast?.("Ошибка привязки UI-действий: " + (error?.message || error)); } catch {}
      return false;
    }
  }

  window.NVActionBridge = {
    bind(root = document) {
      if (!root?.querySelectorAll) return;
      const selector = ATTRS.map((attr) => `[${attr}], [data-action]`).join(",");
      const bindOne = (element) => {
        metrics.scanned += 1;
        if (element?.dataset?.action && !element.dataset.nvBoundDataAction) {
          element.dataset.nvBoundDataAction = "1";
          element.addEventListener("click", function onNvDataAction(event) {
            return runInlineAction(this, event, "");
          });
          metrics.bound += 1;
          metrics.byAttr["data-action"] = (metrics.byAttr["data-action"] || 0) + 1;
        }
        for (const attr of ATTRS) {
          const code = element.getAttribute?.(attr);
          if (!code || element.dataset[`nvBound${attr}`]) continue;
          element.dataset[`nvBound${attr}`] = "1";
          element.addEventListener(eventName(attr), function onNvAction(event) {
            return runInlineAction(this, event, code);
          });
          element.removeAttribute(attr);
          metrics.bound += 1;
          metrics.byAttr[attr] = (metrics.byAttr[attr] || 0) + 1;
        }
      };
      if (root.nodeType === 1) bindOne(root);
      root.querySelectorAll(selector).forEach(bindOne);
    },
    stats() {
      return { ...metrics, byAttr: { ...metrics.byAttr } };
    },
    resetStats() {
      metrics.scanned = 0;
      metrics.bound = 0;
      metrics.errors = 0;
      metrics.lastError = "";
      metrics.lastAction = "";
      metrics.byAttr = {};
    },
  };

  window.nvBindPartial = bindPartial;
  window.nv146UiActionStats = () => window.NVActionBridge.stats();

  const startObserver = () => {
    window.NVActionBridge.bind(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node?.nodeType === 1) window.NVActionBridge.bind(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();
})();
