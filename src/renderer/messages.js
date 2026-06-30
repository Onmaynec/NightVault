"use strict";

(function installNightVaultMessageHelpers() {
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function linkifyAndMentions(raw = "", query = "") {
    let text = escapeHtml(raw);
    if (query) {
      const re = new RegExp("(" + escapeRegExp(query) + ")", "ig");
      text = text.replace(re, '<mark class="highlight">$1</mark>');
    }
    text = text.replace(/(^|\s)@([a-z0-9_]{3,32})\b/gi, (_match, prefix, username) => {
      const normalized = username.toLowerCase();
      return `${prefix}<button class="mention" onclick="startPrivate('${normalized}')">@${escapeHtml(normalized)}</button>`;
    });
    return text.replace(/(^|\s)((?:https?:\/\/|www\.)[^\s<]+)/gi, (_match, prefix, url) => {
      const rawUrl = url.startsWith("www.") ? "https://" + url : url;
      let safe = "";
      try {
        const parsed = new URL(rawUrl);
        if (["http:", "https:"].includes(parsed.protocol)) {
          parsed.username = "";
          parsed.password = "";
          safe = encodeURIComponent(parsed.toString());
        }
      } catch {}
      return safe
        ? `${prefix}<button class="textLink" onclick="openExternalLink('${safe}')">${escapeHtml(url)}</button>`
        : `${prefix}${escapeHtml(url)}`;
    });
  }

  function replyPreviewText(message) {
    if (!message) return "сообщение";
    return message.text || message.attachment?.name || "сообщение";
  }

  window.NVRendererMessages = Object.freeze({
    escapeHtml,
    escapeRegExp,
    linkifyAndMentions,
    replyPreviewText,
  });
})();
