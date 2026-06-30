"use strict";

function buildReplyPreview(message, textSanitizer) {
  if (!message) return null;
  const sourceText =
    message.text ||
    message.attachment?.name ||
    (message.attachment ? "вложение" : "сообщение");
  return {
    id: message.id,
    from: message.from,
    text: textSanitizer(sourceText, 160),
    attachment: message.attachment
      ? {
          name: textSanitizer(message.attachment.name || "файл", 120),
          type: String(message.attachment.type || "").slice(0, 80),
        }
      : null,
  };
}

function extractMentionsForChat(text, chat, sender, mentionParser) {
  const members = new Set(chat?.members || []);
  return mentionParser(text).filter(
    (username) => members.has(username) && username !== sender,
  );
}

function canUserMutateMessage(message, chat, username, { allowAdmins = false } = {}) {
  if (!message || !chat?.members?.includes(username)) return false;
  if (message.deletedForAll) return false;
  if (message.selfDestructAt && message.selfDestructAt <= Date.now()) return false;
  if (message.from === username) return true;
  return allowAdmins && Array.isArray(chat.admins) && chat.admins.includes(username);
}

module.exports = { buildReplyPreview, extractMentionsForChat, canUserMutateMessage };
