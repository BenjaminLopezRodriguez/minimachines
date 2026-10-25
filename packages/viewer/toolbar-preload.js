// The toolbar's only bridge to the main process: a fixed set of verbs, no raw ipcRenderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("viewer", {
  navigate: (url) => ipcRenderer.send("navigate", String(url)),
  back: () => ipcRenderer.send("back"),
  reload: () => ipcRenderer.send("reload"),
  devtools: () => ipcRenderer.send("devtools"),
  external: () => ipcRenderer.send("external"),
  onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
  onError: (fn) => ipcRenderer.on("error", (_e, s) => fn(s)),
  onFocusAddress: (fn) => ipcRenderer.on("focus-address", () => fn()),
});
