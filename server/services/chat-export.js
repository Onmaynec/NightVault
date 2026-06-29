"use strict";

function buildChatExport({ chat, messages, viewer, chatSafe, safeMessage, messageVisibleTo }) {
  const visibleMessages = (messages || [])
    .filter((message) => messageVisibleTo(message, viewer))
    .map(safeMessage);
  return {
    format: "nightvault-chat-export",
    version: 2,
    exportedAt: Date.now(),
    exportedBy: viewer,
    chat: chatSafe(chat, viewer),
    messages: visibleMessages,
    counts: {
      messages: visibleMessages.length,
      attachments: visibleMessages.filter((message) => message.attachment).length,
      mentions: visibleMessages.reduce(
        (sum, message) => sum + (message.mentions || []).length,
        0,
      ),
    },
  };
}

module.exports = { buildChatExport };
