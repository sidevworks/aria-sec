// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("aria", {
  // Renderer → Main: trigger a native OS notification
  notify: ({ title, body, urgency = "normal" }) => {
    ipcRenderer.send("aria:notify", { title, body, urgency });
  },

  // Main → Renderer: server online/offline status
  onServerStatus: (callback) => {
    ipcRenderer.on("aria:server-status", (_event, status) => callback(status));
  },

  // Main → Renderer: tray quick-action triggers (e.g. "show", "scan")
  onTrayAction: (callback) => {
    ipcRenderer.on("aria:tray-action", (_event, action) => callback(action));
  },

  // Renderer → Main: update tray tooltip/badge with current threat state
  setThreatState: ({ state, threat }) => {
    ipcRenderer.send("aria:threat-state", { state, threat });
  },

  // Renderer → Main: open safe external links such as mailto: in the OS default app.
  openExternal: (url) => ipcRenderer.invoke("aria:open-external", { url }),

  // Is running inside Electron?
  isElectron: true,
});
