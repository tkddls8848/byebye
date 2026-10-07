"use strict";

// mods/desktop-shell/src/preload/app.ts
var import_electron = require("electron");

// mods/desktop-shell/src/shared/ipc.ts
var COVER = "desk:cover";

// mods/desktop-shell/src/preload/app.ts
var api = {
  onCover(listener) {
    import_electron.ipcRenderer.on(COVER, () => listener());
  }
};
import_electron.contextBridge.exposeInMainWorld("worksheetDesk", api);
