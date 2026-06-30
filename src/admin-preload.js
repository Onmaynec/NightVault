"use strict";
const { contextBridge, ipcRenderer } = require("electron");
function on(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld("nvAdmin", {
  close: () => ipcRenderer.invoke("app-close"),
  minimize: () => ipcRenderer.invoke("app-minimize"),
  toggleFull: () => ipcRenderer.invoke("app-toggle-fullscreen"),
  login: (data) => ipcRenderer.invoke("admin-login", data),
  changePassword: (data) => ipcRenderer.invoke("admin-change-password", data),
  startServer: () => ipcRenderer.invoke("admin-start-server"),
  stopServer: () => ipcRenderer.invoke("admin-stop-server"),
  status: () => ipcRenderer.invoke("admin-status"),
  snapshot: () => ipcRenderer.invoke("admin-snapshot"),
  backupCreate: () => ipcRenderer.invoke("admin-backup-create"),
  backupList: () => ipcRenderer.invoke("admin-backup-list"),
  releaseCheck: () => ipcRenderer.invoke("admin-release-check"),
  maintenanceGet: () => ipcRenderer.invoke("admin-maintenance-get"),
  maintenanceSet: (data) => ipcRenderer.invoke("admin-maintenance-set", data),
  broadcast: (data) => ipcRenderer.invoke("admin-broadcast", data),
  logs: () => ipcRenderer.invoke("admin-logs"),
  runTest: (name) => ipcRenderer.invoke("admin-run-test", name),
  dbTables: () => ipcRenderer.invoke("admin-db-tables"),
  dbRead: (table, limit) => ipcRenderer.invoke("admin-db-read", { table, limit }),
  debugReport: () => ipcRenderer.invoke("admin-debug-report"),
  command: (command) => ipcRenderer.invoke("admin-command", command),
  exportData: () => ipcRenderer.invoke("admin-export-data"),
  importData: () => ipcRenderer.invoke("admin-import-data"),
  onLog: (callback) => on("admin-log", callback),
});
