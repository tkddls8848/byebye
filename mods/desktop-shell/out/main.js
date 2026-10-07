"use strict";

// mods/desktop-shell/src/main/main.ts
var import_electron3 = require("electron");
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");

// mods/desktop-shell/src/shared/ipc.ts
var COVER = "desk:cover";
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

// mods/desktop-shell/src/main/address.ts
function normalizeAddress(input) {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname) return url.toString();
  } catch {
  }
  return null;
}
function startUrl(override, fallback) {
  if (!override) return fallback;
  try {
    const url = new URL(override);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
  }
  return fallback;
}
function schemeOf(url) {
  if (url.startsWith("https:")) return "https";
  if (url.startsWith("http:")) return "http";
  return "other";
}

// mods/desktop-shell/src/main/guard.ts
var import_electron2 = require("electron");

// mods/desktop-shell/src/main/protocol.ts
var import_electron = require("electron");
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");

// src/host.ts
var PUBLIC_ORIGIN = "https://byebye.tkddls8848.workers.dev";
var defaults = {
  apiBase: "",
  shareBase: "",
  homeHref: "/",
  setTitle: true,
  coverOnHidden: true,
  readShareFromUrl: true
};
var current = { ...defaults };

// mods/desktop-shell/src/main/protocol.ts
var SCHEME = "worksheet";
var APP_ORIGIN = `${SCHEME}://app`;
var CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join("; ");
var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};
function registerScheme() {
  import_electron.protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
  ]);
}
var plain = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
async function serveFile(root, pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return plain(400, "bad path");
  }
  if (path === "/" || path === "") path = "/index.html";
  const file = (0, import_node_path.resolve)(root, `.${path}`);
  if (!file.startsWith(root + import_node_path.sep)) return plain(404, "not found");
  let body;
  try {
    body = await (0, import_promises.readFile)(file);
  } catch {
    return plain(404, "not found");
  }
  const type = TYPES[(0, import_node_path.extname)(file).toLowerCase()] ?? "application/octet-stream";
  const headers = {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache"
  };
  if (type.startsWith("text/html")) {
    headers["content-security-policy"] = CSP;
    headers["cross-origin-opener-policy"] = "same-origin";
    headers["referrer-policy"] = "no-referrer";
  }
  return new Response(new Uint8Array(body), { status: 200, headers });
}
async function proxyApi(request, url, session2) {
  if (request.method !== "GET") return plain(405, "method not allowed");
  const target = new URL(`${url.pathname}${url.search}`, PUBLIC_ORIGIN);
  if (target.origin !== PUBLIC_ORIGIN || !target.pathname.startsWith("/api/")) return plain(404, "not found");
  let upstream;
  try {
    upstream = await session2.fetch(target.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(2e4)
    });
  } catch {
    return Response.error();
  }
  const headers = {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  return new Response(upstream.body, { status: upstream.status, headers });
}
function handleAppProtocol(session2, root) {
  const base = (0, import_node_path.resolve)(root);
  session2.protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return plain(404, "not found");
    if (url.pathname.startsWith("/api/")) return proxyApi(request, url, session2);
    return serveFile(base, url.pathname);
  });
}

// mods/desktop-shell/src/main/guard.ts
var isWeb = (url) => {
  try {
    const { protocol: protocol2 } = new URL(url);
    return protocol2 === "https:" || protocol2 === "http:";
  } catch {
    return false;
  }
};
function noSpellcheck(session2) {
  session2.setSpellCheckerEnabled(false);
  if (process.platform !== "darwin") session2.setSpellCheckerLanguages([]);
}
function guardWebSession(session2) {
  session2.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session2.setPermissionCheckHandler(() => false);
  session2.setDevicePermissionHandler(() => false);
  noSpellcheck(session2);
}
function guardAppSession(session2) {
  const allowed = (permission, origin) => permission === "clipboard-sanitized-write" && origin.startsWith(APP_ORIGIN);
  session2.setPermissionRequestHandler((_contents, permission, callback, details) => callback(allowed(permission, details.requestingUrl ?? "")));
  session2.setPermissionCheckHandler((_contents, permission, origin) => allowed(permission, origin));
  session2.setDevicePermissionHandler(() => false);
  noSpellcheck(session2);
}
function guardWebContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isWeb(url)) void contents.loadURL(url).catch(() => void 0);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event) => {
    if (!isWeb(event.url)) event.preventDefault();
  });
  contents.on("will-redirect", (event) => {
    if (!isWeb(event.url)) event.preventDefault();
  });
}
function guardAppContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => {
    if (!event.url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  contents.on("will-redirect", (event) => {
    if (!event.url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
}
function guardEverything() {
  import_electron2.app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
  import_electron2.app.on("select-client-certificate", (event, _contents, _url, _list, callback) => {
    event.preventDefault();
    callback();
  });
}

// mods/desktop-shell/src/main/layout.ts
var TOOLBAR_HEIGHT = 44;
var SPLITTER_WIDTH = 6;
var DEFAULT_PANE_WIDTH = 400;
var MIN_PANE_WIDTH = 320;
var MIN_WEB_WIDTH = 360;
var MIN_WINDOW_WIDTH = MIN_WEB_WIDTH + SPLITTER_WIDTH + MIN_PANE_WIDTH;
var MIN_WINDOW_HEIGHT = 420;
function clampPaneWidth(wanted, contentWidth) {
  const max = Math.max(MIN_PANE_WIDTH, contentWidth - SPLITTER_WIDTH - MIN_WEB_WIDTH);
  const value = Number.isFinite(wanted) ? Math.round(wanted) : DEFAULT_PANE_WIDTH;
  return Math.min(Math.max(value, MIN_PANE_WIDTH), max);
}
function computeLayout(width, height, paneVisible, wantedPane) {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const top = Math.min(TOOLBAR_HEIGHT, h);
  const bodyHeight = h - top;
  const paneWidth = Math.min(clampPaneWidth(wantedPane, w), Math.max(0, w - SPLITTER_WIDTH));
  const splitX = Math.max(0, w - SPLITTER_WIDTH - paneWidth);
  return {
    toolbar: { x: 0, y: 0, width: w, height: top },
    web: { x: 0, y: top, width: paneVisible ? splitX : w, height: bodyHeight },
    splitter: { x: splitX, y: top, width: SPLITTER_WIDTH, height: bodyHeight },
    app: { x: splitX + SPLITTER_WIDTH, y: top, width: paneWidth, height: bodyHeight },
    paneWidth
  };
}

// mods/desktop-shell/src/main/state.ts
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
var FILE = "desk-layout.json";
var defaults2 = { paneWidth: DEFAULT_PANE_WIDTH, paneVisible: true, bounds: null };
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
function readBounds(value) {
  if (!value || typeof value !== "object") return null;
  const { x, y, width, height } = value;
  if (!isNumber(x) || !isNumber(y) || !isNumber(width) || !isNumber(height)) return null;
  return { x, y, width, height };
}
function loadPrefs(dir) {
  try {
    const raw = JSON.parse((0, import_node_fs.readFileSync)((0, import_node_path2.join)(dir, FILE), "utf8"));
    return {
      paneWidth: isNumber(raw.paneWidth) ? raw.paneWidth : defaults2.paneWidth,
      paneVisible: typeof raw.paneVisible === "boolean" ? raw.paneVisible : defaults2.paneVisible,
      bounds: readBounds(raw.bounds)
    };
  } catch {
    return { ...defaults2 };
  }
}
function savePrefs(dir, prefs2) {
  try {
    (0, import_node_fs.writeFileSync)((0, import_node_path2.join)(dir, FILE), `${JSON.stringify(prefs2, null, 2)}
`);
  } catch {
  }
}

// mods/desktop-shell/src/main/main.ts
var TITLE = "WORKSHEET \uB370\uC2A4\uD06C";
var DEFAULT_START = "https://search.naver.com/";
var BOSS_KEY = "Alt+Shift+K";
var WEB_PARTITION = "persist:web";
var APP_PARTITION = "persist:worksheet";
var PANE_STEP = 16;
import_electron3.app.setPath(
  "userData",
  process.env.WORKSHEET_USER_DATA ? (0, import_node_path3.resolve)(process.env.WORKSHEET_USER_DATA) : (0, import_node_path3.join)(import_electron3.app.getPath("appData"), TITLE)
);
var START_URL = startUrl(process.env.WORKSHEET_START_URL, DEFAULT_START);
registerScheme();
guardEverything();
var desk = null;
var prefs;
var layout = null;
var covered = false;
var bossKey = "";
var failure = "";
var drag = null;
var saveTimer = null;
var dark = () => import_electron3.nativeTheme.shouldUseDarkColors;
var pageColor = () => dark() ? "#121417" : "#f5f6f8";
var surfaceColor = () => dark() ? "#1b1e22" : "#ffffff";
function findAppRoot() {
  const base = import_electron3.app.getAppPath();
  const candidates = [(0, import_node_path3.join)(base, "app"), (0, import_node_path3.resolve)(base, "../../dist-mods/desktop-shell/app")];
  return candidates.find((dir) => (0, import_node_fs2.existsSync)((0, import_node_path3.join)(dir, "index.html")) && (0, import_node_fs2.existsSync)((0, import_node_path3.join)(dir, "toolbar.html"))) ?? null;
}
function restoredBounds(saved) {
  if (!saved) return { width: 1440, height: 900 };
  const onScreen = import_electron3.screen.getAllDisplays().some(({ workArea: a }) => saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y + saved.height > a.y);
  return onScreen ? saved : { width: saved.width, height: saved.height };
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (desk && !desk.win.isDestroyed()) prefs.bounds = desk.win.getNormalBounds();
  savePrefs(import_electron3.app.getPath("userData"), prefs);
}
function relayout() {
  if (!desk) return;
  const [width = 0, height = 0] = desk.win.getContentSize();
  layout = computeLayout(width, height, prefs.paneVisible, prefs.paneWidth);
  desk.toolbar.setBounds(layout.toolbar);
  desk.web.setBounds(layout.web);
  desk.splitter.setBounds(layout.splitter);
  desk.pane.setBounds(layout.app);
  desk.splitter.setVisible(prefs.paneVisible);
  desk.pane.setVisible(prefs.paneVisible);
}
function resizePane(wanted) {
  if (!desk) return;
  const [width = 0] = desk.win.getContentSize();
  prefs.paneWidth = clampPaneWidth(wanted, width);
  relayout();
  scheduleSave();
}
function setPaneVisible(visible) {
  if (!desk) return;
  prefs.paneVisible = visible;
  relayout();
  if (!visible && desk.win.isFocused()) desk.web.webContents.focus();
  sendState();
  scheduleSave();
}
function pressBossKey() {
  if (!desk) return;
  if (prefs.paneVisible || !covered) {
    desk.pane.webContents.send(COVER);
    covered = true;
    setPaneVisible(false);
  } else {
    covered = false;
    setPaneVisible(true);
  }
}
function togglePane() {
  covered = false;
  setPaneVisible(!prefs.paneVisible);
}
function currentState() {
  const contents = desk?.web.webContents;
  const url = contents?.getURL() || START_URL;
  return {
    url,
    scheme: schemeOf(url),
    canGoBack: contents?.navigationHistory.canGoBack() ?? false,
    canGoForward: contents?.navigationHistory.canGoForward() ?? false,
    loading: contents?.isLoading() ?? false,
    failure,
    paneVisible: prefs.paneVisible,
    covered,
    bossKey
  };
}
function sendState() {
  if (!desk || desk.toolbar.webContents.isDestroyed()) return;
  desk.toolbar.webContents.send(STATE, currentState());
}
function watchWebState(contents) {
  contents.on("did-start-loading", sendState);
  contents.on("did-stop-loading", sendState);
  contents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) failure = "";
  });
  contents.on("did-navigate", sendState);
  contents.on("did-navigate-in-page", (_event, _url, isMainFrame) => {
    if (isMainFrame) sendState();
  });
  contents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    failure = description || `ERR ${code}`;
    sendState();
  });
  contents.on("render-process-gone", () => {
    failure = "RENDERER_GONE";
    sendState();
  });
}
function navigate(action) {
  const contents = desk?.web.webContents;
  if (!contents) return;
  const history = contents.navigationHistory;
  if (action === "back" && history.canGoBack()) history.goBack();
  else if (action === "forward" && history.canGoForward()) history.goForward();
  else if (action === "reload") contents.reload();
  else if (action === "stop") contents.stop();
}
function focusAddress() {
  if (!desk) return;
  desk.toolbar.webContents.focus();
  desk.toolbar.webContents.send(FOCUS_ADDRESS);
}
function buildMenu() {
  const mac = process.platform === "darwin";
  const template = [
    ...mac ? [{ role: "appMenu" }] : [],
    {
      label: "\uD3B8\uC9D1",
      submenu: [
        { role: "undo", label: "\uC2E4\uD589 \uCDE8\uC18C" },
        { role: "redo", label: "\uB2E4\uC2DC \uC2E4\uD589" },
        { type: "separator" },
        { role: "cut", label: "\uC798\uB77C\uB0B4\uAE30" },
        { role: "copy", label: "\uBCF5\uC0AC" },
        { role: "paste", label: "\uBD99\uC5EC\uB123\uAE30" },
        { role: "selectAll", label: "\uBAA8\uB450 \uC120\uD0DD" }
      ]
    },
    {
      label: "\uBCF4\uAE30",
      submenu: [
        { id: "back", label: "\uB4A4\uB85C", accelerator: mac ? "Cmd+[" : "Alt+Left", click: () => navigate("back") },
        { id: "forward", label: "\uC55E\uC73C\uB85C", accelerator: mac ? "Cmd+]" : "Alt+Right", click: () => navigate("forward") },
        { id: "reload", label: "\uC0C8\uB85C \uACE0\uCE68", accelerator: "CmdOrCtrl+R", click: () => navigate("reload") },
        { id: "focus-address", label: "\uC8FC\uC18C \uCE78\uC73C\uB85C", accelerator: "CmdOrCtrl+L", click: focusAddress },
        { type: "separator" },
        { id: "toggle-pane", label: "\uC2DC\uD2B8 \uCE78 \uC811\uAE30/\uD3B4\uAE30", click: togglePane },
        // 실제 단축키는 globalShortcut 이 잡는다. 메뉴에는 안내로만 적는다.
        { id: "boss-key", label: "\uC218\uCE58 \uAC00\uB9AC\uACE0 \uC811\uAE30", accelerator: BOSS_KEY, registerAccelerator: false, click: pressBossKey }
      ]
    },
    { role: "windowMenu", label: "\uCC3D" }
  ];
  return import_electron3.Menu.buildFromTemplate(template);
}
function contextMenu(contents, withNavigation) {
  contents.on("context-menu", (_event, params) => {
    if (!desk) return;
    const items = [];
    if (withNavigation) {
      items.push(
        { label: "\uB4A4\uB85C", enabled: contents.navigationHistory.canGoBack(), click: () => navigate("back") },
        { label: "\uC55E\uC73C\uB85C", enabled: contents.navigationHistory.canGoForward(), click: () => navigate("forward") },
        { label: "\uC0C8\uB85C \uACE0\uCE68", click: () => navigate("reload") },
        { type: "separator" }
      );
    }
    if (params.isEditable) {
      items.push(
        { role: "cut", label: "\uC798\uB77C\uB0B4\uAE30", enabled: params.editFlags.canCut },
        { role: "copy", label: "\uBCF5\uC0AC", enabled: params.editFlags.canCopy },
        { role: "paste", label: "\uBD99\uC5EC\uB123\uAE30", enabled: params.editFlags.canPaste },
        { role: "selectAll", label: "\uBAA8\uB450 \uC120\uD0DD" }
      );
    } else {
      items.push({ role: "copy", label: "\uBCF5\uC0AC", enabled: params.editFlags.canCopy }, { role: "selectAll", label: "\uBAA8\uB450 \uC120\uD0DD" });
    }
    import_electron3.Menu.buildFromTemplate(items).popup({ window: desk.win });
  });
}
function ourPreferences(preload) {
  return {
    partition: APP_PARTITION,
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
    spellcheck: false,
    navigateOnDragDrop: false
  };
}
var WEB_PREFERENCES = {
  partition: WEB_PARTITION,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
  navigateOnDragDrop: false,
  safeDialogs: true
};
function createDesk(root) {
  const win = new import_electron3.BaseWindow({
    ...restoredBounds(prefs.bounds),
    title: TITLE,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    autoHideMenuBar: true,
    backgroundColor: pageColor(),
    icon: (0, import_node_path3.join)(root, "icon.png")
  });
  const toolbar = new import_electron3.WebContentsView({ webPreferences: ourPreferences((0, import_node_path3.join)(__dirname, "preload-chrome.js")) });
  const web = new import_electron3.WebContentsView({ webPreferences: WEB_PREFERENCES });
  const splitter = new import_electron3.WebContentsView({ webPreferences: ourPreferences((0, import_node_path3.join)(__dirname, "preload-chrome.js")) });
  const pane = new import_electron3.WebContentsView({ webPreferences: ourPreferences((0, import_node_path3.join)(__dirname, "preload-app.js")) });
  toolbar.setBackgroundColor(surfaceColor());
  splitter.setBackgroundColor(surfaceColor());
  pane.setBackgroundColor(pageColor());
  web.setBackgroundColor("#ffffff");
  for (const view of [toolbar, splitter, pane]) guardAppContents(view.webContents);
  guardWebContents(web.webContents);
  watchWebState(web.webContents);
  contextMenu(web.webContents, true);
  contextMenu(pane.webContents, false);
  contextMenu(toolbar.webContents, false);
  win.contentView.addChildView(web);
  win.contentView.addChildView(splitter);
  win.contentView.addChildView(pane);
  win.contentView.addChildView(toolbar);
  desk = { win, toolbar, web, splitter, pane };
  relayout();
  win.on("resize", relayout);
  const coverOnLeave = () => pane.webContents.send(COVER);
  win.on("minimize", coverOnLeave);
  win.on("hide", coverOnLeave);
  win.on("resized", scheduleSave);
  win.on("moved", scheduleSave);
  win.on("close", saveNow);
  win.on("closed", () => {
    for (const view of [toolbar, web, splitter, pane]) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    desk = null;
  });
  import_electron3.nativeTheme.on("updated", () => {
    if (!desk) return;
    desk.win.setBackgroundColor(pageColor());
    desk.toolbar.setBackgroundColor(surfaceColor());
    desk.splitter.setBackgroundColor(surfaceColor());
    desk.pane.setBackgroundColor(pageColor());
  });
  void toolbar.webContents.loadURL(`${APP_ORIGIN}/toolbar.html`);
  void splitter.webContents.loadURL(`${APP_ORIGIN}/splitter.html`);
  void pane.webContents.loadURL(`${APP_ORIGIN}/index.html`);
  web.webContents.loadURL(START_URL).catch(() => void 0);
  return desk;
}
var isNumber2 = (value) => typeof value === "number" && Number.isFinite(value);
function sentBy(event, view) {
  if (!view || event.sender !== view.webContents) return false;
  return (event.senderFrame?.url ?? "").startsWith(`${APP_ORIGIN}/`);
}
function listen() {
  import_electron3.ipcMain.handle(GET_STATE, (event) => sentBy(event, desk?.toolbar) ? currentState() : null);
  import_electron3.ipcMain.on(NAV, (event, action) => {
    if (!sentBy(event, desk?.toolbar)) return;
    if (action === "back" || action === "forward" || action === "reload" || action === "stop") navigate(action);
  });
  import_electron3.ipcMain.handle(GO, (event, input) => {
    if (!desk || !sentBy(event, desk.toolbar) || typeof input !== "string") return false;
    const url = normalizeAddress(input);
    if (!url) return false;
    desk.web.webContents.loadURL(url).catch(() => void 0);
    desk.web.webContents.focus();
    return true;
  });
  import_electron3.ipcMain.on(TOGGLE_PANE, (event) => {
    if (sentBy(event, desk?.toolbar)) togglePane();
  });
  import_electron3.ipcMain.on(SPLIT_START, (event, screenX) => {
    if (!layout || !sentBy(event, desk?.splitter) || !isNumber2(screenX)) return;
    drag = { startX: screenX, startWidth: layout.paneWidth };
  });
  import_electron3.ipcMain.on(SPLIT_MOVE, (event, screenX) => {
    if (!drag || !sentBy(event, desk?.splitter) || !isNumber2(screenX)) return;
    resizePane(drag.startWidth + (drag.startX - screenX));
  });
  import_electron3.ipcMain.on(SPLIT_END, (event) => {
    if (sentBy(event, desk?.splitter)) drag = null;
  });
  import_electron3.ipcMain.on(SPLIT_RESET, (event) => {
    if (sentBy(event, desk?.splitter)) resizePane(DEFAULT_PANE_WIDTH);
  });
  import_electron3.ipcMain.on(SPLIT_STEP, (event, delta) => {
    if (!layout || !sentBy(event, desk?.splitter) || !isNumber2(delta)) return;
    resizePane(layout.paneWidth + Math.sign(delta) * PANE_STEP);
  });
}
function start() {
  const root = findAppRoot();
  if (!root) {
    import_electron3.dialog.showErrorBox(TITLE, "\uD654\uBA74 \uD30C\uC77C\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uBE4C\uB4DC\uD558\uC2ED\uC2DC\uC624: node mods/desktop-shell/build.mjs");
    import_electron3.app.quit();
    return;
  }
  const ours = import_electron3.session.fromPartition(APP_PARTITION);
  handleAppProtocol(ours, root);
  guardAppSession(ours);
  guardWebSession(import_electron3.session.fromPartition(WEB_PARTITION));
  guardWebSession(import_electron3.session.defaultSession);
  prefs = loadPrefs(import_electron3.app.getPath("userData"));
  import_electron3.Menu.setApplicationMenu(buildMenu());
  listen();
  createDesk(root);
  bossKey = import_electron3.globalShortcut.register(BOSS_KEY, pressBossKey) ? BOSS_KEY : "";
  if (!bossKey) console.warn(`[desk] ${BOSS_KEY} \uB97C \uB2E4\uB978 \uD504\uB85C\uADF8\uB7A8\uC774 \uC4F0\uACE0 \uC788\uC5B4 \uBCF4\uC2A4 \uD0A4\uB97C \uB4F1\uB85D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`);
  sendState();
}
if (!import_electron3.app.requestSingleInstanceLock()) {
  import_electron3.app.quit();
} else {
  import_electron3.app.on("second-instance", () => {
    if (!desk) return;
    if (desk.win.isMinimized()) desk.win.restore();
    desk.win.focus();
  });
  import_electron3.app.on("window-all-closed", () => import_electron3.app.quit());
  import_electron3.app.on("will-quit", () => import_electron3.globalShortcut.unregisterAll());
  void import_electron3.app.whenReady().then(start);
}
