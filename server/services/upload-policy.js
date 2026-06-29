"use strict";

const config = require("../lib/config");
const { recordSecurityEvent } = require("./security-events");

function uploadClassForMime(mime) {
  const value = String(mime || "");
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("audio/")) return "audio";
  if (value.startsWith("video/")) return "video";
  if (
    value === "application/pdf" ||
    value === "application/zip" ||
    value === "text/plain"
  ) {
    return "document";
  }
  return "unknown";
}

function maxBytesForClass(kind) {
  const limits = {
    image: config.maxImageBytes,
    audio: config.maxAudioBytes,
    video: config.maxVideoBytes,
    document: config.maxDocumentBytes,
  };
  return limits[kind] || config.maxFileBytes;
}

function validateUploadedFile(file, detected, context = {}) {
  const username = String(context.username || "");
  const ip = String(context.ip || "");
  const mime = String(detected?.mime || "application/octet-stream");
  const kind = uploadClassForMime(mime);
  const encryptedEnvelope = /\.nve$/i.test(String(file?.originalname || "")) && mime === "application/octet-stream";
  if (encryptedEnvelope) {
    const limit = config.maxFileBytes;
    if (file.size > limit) {
      return { ok: false, status: 413, error: `Зашифрованный файл слишком большой. Максимум ${Math.round(limit / 1024 / 1024)} MB.` };
    }
    return { ok: true, kind: "encrypted", mime: "application/octet-stream", limit };
  }
  if (detected?.blocked || kind === "unknown") {
    recordSecurityEvent("upload_blocked", {
      username,
      ip,
      severity: "warning",
      message: "Заблокирован неподдерживаемый или исполняемый файл.",
      meta: { mime, name: file?.originalname || "" },
    });
    return { ok: false, status: 415, error: "Этот тип файла не поддерживается." };
  }

  const limit = maxBytesForClass(kind);
  if (file.size > limit) {
    recordSecurityEvent("upload_too_large", {
      username,
      ip,
      severity: "warning",
      message: "Файл превысил лимит размера для своего типа.",
      meta: { mime, size: file.size, limit },
    });
    return {
      ok: false,
      status: 413,
      error: `Файл слишком большой для типа ${kind}. Максимум ${Math.round(limit / 1024 / 1024)} MB.`,
    };
  }
  return { ok: true, kind, mime, limit };
}

module.exports = { uploadClassForMime, maxBytesForClass, validateUploadedFile };
