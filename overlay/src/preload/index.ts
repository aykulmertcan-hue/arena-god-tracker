import { contextBridge, ipcRenderer } from "electron";

const api = {
  getChecklist: () => ipcRenderer.invoke("checklist:get"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  setKey: (key: string) => ipcRenderer.invoke("settings:setKey", key),
  triggerScan: () => ipcRenderer.invoke("scan:trigger"),
  hide: () => ipcRenderer.invoke("window:hide"),
  openExternal: (url: string) => ipcRenderer.invoke("open:external", url),
  onChecklist: (cb: (data: unknown) => void) =>
    ipcRenderer.on("checklist:update", (_e, d) => cb(d)),
  onStatus: (cb: (data: unknown) => void) =>
    ipcRenderer.on("status:update", (_e, d) => cb(d)),
};

contextBridge.exposeInMainWorld("overlay", api);

export type OverlayApi = typeof api;
