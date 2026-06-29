"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function on(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("nv", {
  close: () => ipcRenderer.invoke("app-close"),
  minimize: () => ipcRenderer.invoke("app-minimize"),
  toggleFull: () => ipcRenderer.invoke("app-toggle-fullscreen"),
  windowPrefsGet: () => ipcRenderer.invoke("window-prefs-get"),
  windowPrefsSet: (data) => ipcRenderer.invoke("window-prefs-set", data),
  notify: (data) => ipcRenderer.invoke("notify", data),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  authSave: (data) => ipcRenderer.invoke("auth-save", data),
  authCurrent: () => ipcRenderer.invoke("auth-current"),
  authList: () => ipcRenderer.invoke("auth-list"),
  authUse: (key) => ipcRenderer.invoke("auth-use", key),
  authRemove: (key) => ipcRenderer.invoke("auth-remove", key),
  authClearCurrent: () => ipcRenderer.invoke("auth-clear-current"),
  e2eeKeyLoad: (data) => ipcRenderer.invoke("e2ee-key-load", data),
  e2eeKeySave: (data) => ipcRenderer.invoke("e2ee-key-save", data),
  getVersion: () => ipcRenderer.invoke("app-version"),
  getServerInfo: () => ipcRenderer.invoke("server-info"),
  clientReport: (data) => ipcRenderer.invoke("client-report", data),
  checkUpdates: () => ipcRenderer.invoke("updates-check"),
  downloadUpdate: () => ipcRenderer.invoke("updates-download"),
  installUpdate: () => ipcRenderer.invoke("updates-install"),
  onWindowState: (callback) => on("window-state", callback),
  onUpdateAvailable: (callback) => on("update-available", callback),
  onUpdateProgress: (callback) => on("update-progress", callback),
  onUpdateDownloaded: (callback) => on("update-downloaded", callback),
  onUpdateError: (callback) => on("update-error", callback),
  onUpdateStatus: (callback) => on("update-status", callback),
  onChangelog: (callback) => on("show-changelog", callback),
});
