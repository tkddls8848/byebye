"use strict";

// mods/desktop-shell/src/preload/chrome.ts
var import_electron = require("electron");

// mods/desktop-shell/src/shared/ipc.ts
var GET_STATE = "desk:get-state";
var STATE = "desk:state";
var NAV = "desk:nav";
var GO = "desk:go";
var TOGGLE_PANE = "desk:toggle-pane";
var FOCUS_ADDRESS = "desk:focus-address";
var SPLIT_START = "desk:split-start";
var SPLIT_MOVE = "desk:split-move";
var SPLIT_END = "desk:split-end";
var SPLIT_RESET = "desk:split-reset";
var SPLIT_STEP = "desk:split-step";

// mods/desktop-shell/src/preload/chrome.ts
var api = {
  getState: () => import_electron.ipcRenderer.invoke(GET_STATE),
  onState(listener) {
    import_electron.ipcRenderer.on(STATE, (_event, state) => listener(state));
  },
  onFocusAddress(listener) {
    import_electron.ipcRenderer.on(FOCUS_ADDRESS, () => listener());
  },
  nav: (action) => import_electron.ipcRenderer.send(NAV, action),
  go: (input) => import_electron.ipcRenderer.invoke(GO, String(input)),
  togglePane: () => import_electron.ipcRenderer.send(TOGGLE_PANE),
  splitStart: (screenX) => import_electron.ipcRenderer.send(SPLIT_START, Number(screenX)),
  splitMove: (screenX) => import_electron.ipcRenderer.send(SPLIT_MOVE, Number(screenX)),
  splitEnd: () => import_electron.ipcRenderer.send(SPLIT_END),
  splitReset: () => import_electron.ipcRenderer.send(SPLIT_RESET),
  splitStep: (delta) => import_electron.ipcRenderer.send(SPLIT_STEP, Number(delta))
};
import_electron.contextBridge.exposeInMainWorld("worksheetDeskChrome", api);
