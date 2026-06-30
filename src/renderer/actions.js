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

  function eventName(attr) {
    return attr.slice(2);
  }

  function parseArg(value, event) {
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    if (raw === "event") return event;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    const quoted = raw.match(/^['"]([\s\S]*)['"]$/);
    if (quoted) return quoted[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
    return raw;
  }

  function splitArgs(args) {
    const out = [];
    let current = "";
    let quote = "";
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
      if (char === ",") {
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
    localStorage[key] = String(parseArg(rawValue.trim()));
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
    else if (/^['"]/.test(value)) window.S[key] = parseArg(value);
    else if (/^-?\d+(?:\.\d+)?$/.test(value)) window.S[key] = Number(value);
    else window.S[key] = value;
    return true;
  }

  function runStatement(statement, event, element) {
    const code = statement.trim();
    if (!code) return;
    if (code === "event.stopPropagation()") return event.stopPropagation();
    if (code === "event.preventDefault()") return event.preventDefault();
    if (code === "document.querySelector('.ctx').remove()" || code === "document.querySelector('.ctx')?.remove()") return document.querySelector(".ctx")?.remove();
    if (code === 'document.querySelector(".ctx").remove()' || code === 'document.querySelector(".ctx")?.remove()') return document.querySelector(".ctx")?.remove();
    if (code === "document.querySelector('.emojiPanel').remove()" || code === "document.querySelector('.emojiPanel')?.remove()") return document.querySelector(".emojiPanel")?.remove();
    if (code === 'document.querySelector(".emojiPanel").remove()' || code === 'document.querySelector(".emojiPanel")?.remove()') return document.querySelector(".emojiPanel")?.remove();
    if (code === "closeEmojiPanel()" && typeof window.closeEmojiPanel === "function") return window.closeEmojiPanel();
    if (assignLocalStorage(code)) return;
    if (assignState(code)) return;
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
      for (const statement of String(code || "").split(";")) {
        runStatement(statement, event, element);
      }
    } catch (error) {
      if (typeof window.__nvHandleInlineError === "function") {
        window.__nvHandleInlineError(error);
      } else {
        console.error(error);
      }
    }
  }

  window.NVActionBridge = {
    bind(root = document) {
      if (!root?.querySelectorAll) return;
      const selector = ATTRS.map((attr) => `[${attr}]`).join(",");
      const bindOne = (element) => {
        for (const attr of ATTRS) {
          const code = element.getAttribute(attr);
          if (!code || element.dataset[`nvBound${attr}`]) continue;
          element.dataset[`nvBound${attr}`] = "1";
          element.addEventListener(eventName(attr), function onNvAction(event) {
            return runInlineAction(this, event, code);
          });
          element.removeAttribute(attr);
        }
      };
      if (root.nodeType === 1) bindOne(root);
      root.querySelectorAll(selector).forEach(bindOne);
    },
  };

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
