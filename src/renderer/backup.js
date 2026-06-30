"use strict";

(function installNightVaultBackupHelpers() {
  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  async function sha256Base64(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return bytesToBase64(new Uint8Array(digest));
  }

  function assertBackupEnvelope(envelope) {
    if (envelope?.format !== "nightvault-backup") throw new Error("Неверный формат backup.");
    if (!envelope.kdf?.salt || !envelope.cipher?.iv || !envelope.ciphertext) {
      throw new Error("Backup повреждён: нет параметров шифрования.");
    }
    const iterations = Number(envelope.kdf.iterations || 0);
    if (!Number.isFinite(iterations) || iterations < 150000 || iterations > 1000000) {
      throw new Error("Backup использует неподдерживаемые параметры KDF.");
    }
  }

  async function encryptPayload(payload, password) {
    const rawText = JSON.stringify(payload);
    const raw = new TextEncoder().encode(rawText);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 280000;
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw));
    return {
      format: "nightvault-backup",
      version: 2,
      createdAt: Date.now(),
      checksum: await sha256Base64(rawText),
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: bytesToBase64(salt) },
      cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
      ciphertext: bytesToBase64(encrypted),
    };
  }

  async function decryptEnvelope(envelope, password) {
    assertBackupEnvelope(envelope);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: envelope.kdf.hash || "SHA-256",
        salt: base64ToBytes(envelope.kdf.salt),
        iterations: Number(envelope.kdf.iterations),
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.cipher.iv) },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    const rawText = new TextDecoder().decode(decrypted);
    if (envelope.checksum) {
      const checksum = await sha256Base64(rawText);
      if (checksum !== envelope.checksum) throw new Error("Backup повреждён: checksum не совпадает.");
    }
    return JSON.parse(rawText);
  }

  function downloadEnvelope(envelope, filenamePrefix) {
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.nvb`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  window.NVBackup = Object.freeze({
    bytesToBase64,
    base64ToBytes,
    encryptPayload,
    decryptEnvelope,
    downloadEnvelope,
  });
})();
