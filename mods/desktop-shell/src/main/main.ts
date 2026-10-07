/**
 * WORKSHEET 데스크 — 메인 프로세스.
 *
 * 게임으로 치면 "모드 런처"다. 원본 게임(실제 사이트)은 고치지 않고 원래 주소
 * 그대로 띄우고, 모드 화면(WORKSHEET)은 그 옆 자리에 붙인다. 한 창 안에 칸 네 개를
 * 겹치지 않게 놓는다.
 *
 *   머리줄   worksheet://app/toolbar.html   우리 화면. 뒤로·앞으로·새로 고침·주소 칸
 *   실제 사이트  https://…                    원래 주소 그대로. 프리로드·주입 없음
 *   칸막이   worksheet://app/splitter.html  끌어서 폭을 바꾼다
 *   앱 칸    worksheet://app/index.html     WORKSHEET(FIRE 계산기)
 *
 * 실제 사이트 칸과 우리 칸은 세션(쿠키·저장소)부터 나뉜다. 셸은 실제 사이트에
 * 스크립트를 넣거나 머리글을 고치거나 내용을 읽지 않는다.
 */
import {
  BaseWindow,
  Menu,
  WebContentsView,
  app,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  screen,
  session,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type WebContents,
  type WebPreferences,
} from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ipc from '../shared/ipc';
import { normalizeAddress, schemeOf, startUrl } from './address';
import { guardAppContents, guardAppSession, guardEverything, guardWebContents, guardWebSession } from './guard';
import { DEFAULT_PANE_WIDTH, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, clampPaneWidth, computeLayout, type Layout } from './layout';
import { APP_ORIGIN, handleAppProtocol, registerScheme } from './protocol';
import { loadPrefs, savePrefs, type DeskPrefs, type WindowBounds } from './state';

const TITLE = 'WORKSHEET 데스크';
const DEFAULT_START = 'https://search.naver.com/';
/** 운영체제 전체에서 듣는 보스 키. 이 앱이 떠 있는 동안만 잡고, 끝날 때 놓는다. */
const BOSS_KEY = 'Alt+Shift+K';
/** 실제 사이트 세션. 로그인 쿠키는 여기에만 남는다. */
const WEB_PARTITION = 'persist:web';
/** 우리 세션. 계산기 입력은 이쪽 worksheet://app 저장소에만 남는다. */
const APP_PARTITION = 'persist:worksheet';
const PANE_STEP = 16;

// 앱 데이터 폴더를 늘 직접 정한다. 준비 전에 정해야 세션이 그 폴더에 생긴다.
// Electron 의 암묵적 기본값에 맡겼더니 `npm start` 로 띄운 실행에서 프로필(Cache·Partitions
// 등)이 ~/.config 바로 아래에 흩어졌다. 그래서 appData/WORKSHEET 데스크 를 명시한다(이름은
// package.json 의 productName 과 같다). 시험에서는 WORKSHEET_USER_DATA 로 깨끗한 폴더를 쓴다.
app.setPath(
  'userData',
  process.env.WORKSHEET_USER_DATA ? resolve(process.env.WORKSHEET_USER_DATA) : join(app.getPath('appData'), TITLE),
);

const START_URL = startUrl(process.env.WORKSHEET_START_URL, DEFAULT_START);

registerScheme();
guardEverything();

interface Desk {
  win: BaseWindow;
  toolbar: WebContentsView;
  web: WebContentsView;
  splitter: WebContentsView;
  pane: WebContentsView;
}

let desk: Desk | null = null;
let prefs: DeskPrefs;
let layout: Layout | null = null;
/** 보스 키로 접었는가. 접은 쪽이 보스 키일 때만 보스 키가 다시 편다. */
let covered = false;
let bossKey = '';
let failure = '';
let drag: { startX: number; startWidth: number } | null = null;
let saveTimer: NodeJS.Timeout | null = null;

const dark = (): boolean => nativeTheme.shouldUseDarkColors;
const pageColor = (): string => (dark() ? '#121417' : '#f5f6f8');
const surfaceColor = (): string => (dark() ? '#1b1e22' : '#ffffff');

/** 빌드한 화면 파일이 있는 곳. 묶음(app/)이 먼저, 저장소의 빌드 결과가 다음이다. */
function findAppRoot(): string | null {
  const base = app.getAppPath();
  const candidates = [join(base, 'app'), resolve(base, '../../dist-mods/desktop-shell/app')];
  return candidates.find((dir) => existsSync(join(dir, 'index.html')) && existsSync(join(dir, 'toolbar.html'))) ?? null;
}

/** 지난번 창 자리. 지금 연결된 화면 밖이면 크기만 살린다. */
function restoredBounds(saved: WindowBounds | null): Partial<WindowBounds> {
  if (!saved) return { width: 1440, height: 900 };
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y + saved.height > a.y);
  return onScreen ? saved : { width: saved.width, height: saved.height };
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function saveNow(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (desk && !desk.win.isDestroyed()) prefs.bounds = desk.win.getNormalBounds();
  savePrefs(app.getPath('userData'), prefs);
}

// --- 칸 배치 -----------------------------------------------------------------

function relayout(): void {
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

function resizePane(wanted: number): void {
  if (!desk) return;
  const [width = 0] = desk.win.getContentSize();
  prefs.paneWidth = clampPaneWidth(wanted, width);
  relayout();
  scheduleSave();
}

function setPaneVisible(visible: boolean): void {
  if (!desk) return;
  prefs.paneVisible = visible;
  relayout();
  // 숨긴 칸에 키보드 초점이 남으면 치는 글자가 보이지 않는 곳으로 간다.
  if (!visible && desk.win.isFocused()) desk.web.webContents.focus();
  sendState();
  scheduleSave();
}

/**
 * 보스 키.
 *
 * 펼쳐져 있으면: 앱에 "가려라"를 먼저 보내(문서 목록으로 바뀐다) 칸을 접는다.
 * 실제 사이트가 창을 다 차지하므로 옆자리에서는 평범한 브라우저로 보인다.
 * 보스 키로 접혀 있으면: 다시 편다. 숫자는 가려진 채(문서 목록)로 돌아오므로
 * 시트를 다시 여는 것은 사람이 한다.
 * 머리줄 단추로 접어 둔 상태에서 누르면 펴지 않고 가리기만 한다 — 보스 키가
 * 숨겨 둔 칸을 끄집어내는 일은 없어야 한다.
 */
function pressBossKey(): void {
  if (!desk) return;
  if (prefs.paneVisible || !covered) {
    desk.pane.webContents.send(ipc.COVER);
    covered = true;
    setPaneVisible(false);
  } else {
    covered = false;
    setPaneVisible(true);
  }
}

function togglePane(): void {
  covered = false;
  setPaneVisible(!prefs.paneVisible);
}

// --- 실제 사이트 칸의 상태 -----------------------------------------------------

function currentState(): ipc.DeskState {
  const contents = desk?.web.webContents;
  // 첫 페이지가 열리기 전에는 여는 중인 시작 주소를 보인다. 그 뒤로는 실제로 열린
  // 주소만 보인다.
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
    bossKey,
  };
}

function sendState(): void {
  if (!desk || desk.toolbar.webContents.isDestroyed()) return;
  desk.toolbar.webContents.send(ipc.STATE, currentState());
}

/**
 * 머리줄에 알릴 때를 잡는다. 받는 것은 이동이 일어났다는 사실과 주소뿐이다.
 * 페이지 제목·내용·입력은 듣지 않는다.
 */
function watchWebState(contents: WebContents): void {
  contents.on('did-start-loading', sendState);
  contents.on('did-stop-loading', sendState);
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) failure = '';
  });
  contents.on('did-navigate', sendState);
  contents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
    if (isMainFrame) sendState();
  });
  contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    // -3(ERR_ABORTED)은 다른 곳으로 옮겨 가며 끊긴 것이라 실패가 아니다.
    if (!isMainFrame || code === -3) return;
    failure = description || `ERR ${code}`;
    sendState();
  });
  contents.on('render-process-gone', () => {
    failure = 'RENDERER_GONE';
    sendState();
  });
}

function navigate(action: ipc.NavAction): void {
  const contents = desk?.web.webContents;
  if (!contents) return;
  const history = contents.navigationHistory;
  if (action === 'back' && history.canGoBack()) history.goBack();
  else if (action === 'forward' && history.canGoForward()) history.goForward();
  else if (action === 'reload') contents.reload();
  else if (action === 'stop') contents.stop();
}

function focusAddress(): void {
  if (!desk) return;
  desk.toolbar.webContents.focus();
  desk.toolbar.webContents.send(ipc.FOCUS_ADDRESS);
}

// --- 메뉴 --------------------------------------------------------------------

/**
 * 창 메뉴. 평소에는 숨겨 두고(Alt 로 보인다) 단축키 자리로 쓴다. 실제 사이트의
 * 키 입력을 엿듣지 않고 단축키를 받는 방법이 이것이다.
 */
function buildMenu(): Menu {
  const mac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { id: 'back', label: '뒤로', accelerator: mac ? 'Cmd+[' : 'Alt+Left', click: () => navigate('back') },
        { id: 'forward', label: '앞으로', accelerator: mac ? 'Cmd+]' : 'Alt+Right', click: () => navigate('forward') },
        { id: 'reload', label: '새로 고침', accelerator: 'CmdOrCtrl+R', click: () => navigate('reload') },
        { id: 'focus-address', label: '주소 칸으로', accelerator: 'CmdOrCtrl+L', click: focusAddress },
        { type: 'separator' },
        { id: 'toggle-pane', label: '시트 칸 접기/펴기', click: togglePane },
        // 실제 단축키는 globalShortcut 이 잡는다. 메뉴에는 안내로만 적는다.
        { id: 'boss-key', label: '수치 가리고 접기', accelerator: BOSS_KEY, registerAccelerator: false, click: pressBossKey },
      ],
    },
    { role: 'windowMenu', label: '창' },
  ];
  return Menu.buildFromTemplate(template);
}

/**
 * 오른쪽 클릭 메뉴. 편집 동작은 Chromium 이 직접 한다. 셸은 선택한 글이나 링크
 * 주소를 꺼내 보지 않는다(입력 칸인지, 복사할 수 있는지 같은 표시만 본다).
 */
function contextMenu(contents: WebContents, withNavigation: boolean): void {
  contents.on('context-menu', (_event, params) => {
    if (!desk) return;
    const items: MenuItemConstructorOptions[] = [];
    if (withNavigation) {
      items.push(
        { label: '뒤로', enabled: contents.navigationHistory.canGoBack(), click: () => navigate('back') },
        { label: '앞으로', enabled: contents.navigationHistory.canGoForward(), click: () => navigate('forward') },
        { label: '새로 고침', click: () => navigate('reload') },
        { type: 'separator' },
      );
    }
    if (params.isEditable) {
      items.push(
        { role: 'cut', label: '잘라내기', enabled: params.editFlags.canCut },
        { role: 'copy', label: '복사', enabled: params.editFlags.canCopy },
        { role: 'paste', label: '붙여넣기', enabled: params.editFlags.canPaste },
        { role: 'selectAll', label: '모두 선택' },
      );
    } else {
      items.push({ role: 'copy', label: '복사', enabled: params.editFlags.canCopy }, { role: 'selectAll', label: '모두 선택' });
    }
    Menu.buildFromTemplate(items).popup({ window: desk.win });
  });
}

// --- 창과 칸 -------------------------------------------------------------------

/** 우리 화면(머리줄·칸막이·앱)의 공통 설정. 샌드박스·격리, Node 없음. */
function ourPreferences(preload: string): WebPreferences {
  return {
    partition: APP_PARTITION,
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
    spellcheck: false,
    navigateOnDragDrop: false,
  };
}

/**
 * 실제 사이트 칸의 설정. 프리로드가 **없다** — 셸의 코드가 그 페이지 안에서
 * 돌 길이 없다. 보통 브라우저 탭과 같은 샌드박스·격리에 혼합 콘텐츠도 막는다.
 */
const WEB_PREFERENCES: WebPreferences = {
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
  safeDialogs: true,
};

function createDesk(root: string): Desk {
  const win = new BaseWindow({
    ...restoredBounds(prefs.bounds),
    title: TITLE,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    autoHideMenuBar: true,
    backgroundColor: pageColor(),
    icon: join(root, 'icon.png'),
  });

  const toolbar = new WebContentsView({ webPreferences: ourPreferences(join(__dirname, 'preload-chrome.js')) });
  const web = new WebContentsView({ webPreferences: WEB_PREFERENCES });
  const splitter = new WebContentsView({ webPreferences: ourPreferences(join(__dirname, 'preload-chrome.js')) });
  const pane = new WebContentsView({ webPreferences: ourPreferences(join(__dirname, 'preload-app.js')) });

  toolbar.setBackgroundColor(surfaceColor());
  splitter.setBackgroundColor(surfaceColor());
  pane.setBackgroundColor(pageColor());
  web.setBackgroundColor('#ffffff');

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

  win.on('resize', relayout);
  // 창을 내리거나 숨기면(웹 앱의 다른 탭으로 옮기기에 해당) 수치를 가린다. 칸 안의
  // 문서는 창이 숨어도 visibilitychange 를 늘 받지는 않아서 여기서 직접 알린다.
  // 초점만 잃거나 다른 창 뒤로 갈 때는 가리지 않는다.
  const coverOnLeave = (): void => pane.webContents.send(ipc.COVER);
  win.on('minimize', coverOnLeave);
  win.on('hide', coverOnLeave);
  win.on('resized', scheduleSave);
  win.on('moved', scheduleSave);
  win.on('close', saveNow);
  win.on('closed', () => {
    for (const view of [toolbar, web, splitter, pane]) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    desk = null;
  });

  nativeTheme.on('updated', () => {
    if (!desk) return;
    desk.win.setBackgroundColor(pageColor());
    desk.toolbar.setBackgroundColor(surfaceColor());
    desk.splitter.setBackgroundColor(surfaceColor());
    desk.pane.setBackgroundColor(pageColor());
  });

  void toolbar.webContents.loadURL(`${APP_ORIGIN}/toolbar.html`);
  void splitter.webContents.loadURL(`${APP_ORIGIN}/splitter.html`);
  void pane.webContents.loadURL(`${APP_ORIGIN}/index.html`);
  // 실패해도 did-fail-load 가 머리줄에 알린다. 여기서는 삼킨다.
  web.webContents.loadURL(START_URL).catch(() => undefined);
  return desk;
}

// --- 머리줄·칸막이에서 오는 말 ----------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 보낸 쪽이 그 칸의 우리 화면인지 본다. 다른 콘텐츠가 같은 이름으로 보내도 무시한다. */
function sentBy(event: IpcMainEvent | IpcMainInvokeEvent, view: WebContentsView | undefined): boolean {
  if (!view || event.sender !== view.webContents) return false;
  return (event.senderFrame?.url ?? '').startsWith(`${APP_ORIGIN}/`);
}

function listen(): void {
  ipcMain.handle(ipc.GET_STATE, (event) => (sentBy(event, desk?.toolbar) ? currentState() : null));
  ipcMain.on(ipc.NAV, (event, action: unknown) => {
    if (!sentBy(event, desk?.toolbar)) return;
    if (action === 'back' || action === 'forward' || action === 'reload' || action === 'stop') navigate(action);
  });
  ipcMain.handle(ipc.GO, (event, input: unknown) => {
    if (!desk || !sentBy(event, desk.toolbar) || typeof input !== 'string') return false;
    const url = normalizeAddress(input);
    if (!url) return false;
    desk.web.webContents.loadURL(url).catch(() => undefined);
    desk.web.webContents.focus();
    return true;
  });
  ipcMain.on(ipc.TOGGLE_PANE, (event) => {
    if (sentBy(event, desk?.toolbar)) togglePane();
  });
  ipcMain.on(ipc.SPLIT_START, (event, screenX: unknown) => {
    if (!layout || !sentBy(event, desk?.splitter) || !isNumber(screenX)) return;
    drag = { startX: screenX, startWidth: layout.paneWidth };
  });
  ipcMain.on(ipc.SPLIT_MOVE, (event, screenX: unknown) => {
    if (!drag || !sentBy(event, desk?.splitter) || !isNumber(screenX)) return;
    // 칸막이를 왼쪽으로 끌면 오른쪽 앱 칸이 넓어진다.
    resizePane(drag.startWidth + (drag.startX - screenX));
  });
  ipcMain.on(ipc.SPLIT_END, (event) => {
    if (sentBy(event, desk?.splitter)) drag = null;
  });
  ipcMain.on(ipc.SPLIT_RESET, (event) => {
    if (sentBy(event, desk?.splitter)) resizePane(DEFAULT_PANE_WIDTH);
  });
  ipcMain.on(ipc.SPLIT_STEP, (event, delta: unknown) => {
    if (!layout || !sentBy(event, desk?.splitter) || !isNumber(delta)) return;
    resizePane(layout.paneWidth + Math.sign(delta) * PANE_STEP);
  });
}

// --- 시작과 끝 -----------------------------------------------------------------

function start(): void {
  const root = findAppRoot();
  if (!root) {
    dialog.showErrorBox(TITLE, '화면 파일을 찾지 못했습니다. 먼저 빌드하십시오: node mods/desktop-shell/build.mjs');
    app.quit();
    return;
  }
  const ours = session.fromPartition(APP_PARTITION);
  handleAppProtocol(ours, root);
  guardAppSession(ours);
  guardWebSession(session.fromPartition(WEB_PARTITION));
  // 아무것도 싣지 않는 기본 세션도 같은 빗장을 건다.
  guardWebSession(session.defaultSession);

  prefs = loadPrefs(app.getPath('userData'));
  Menu.setApplicationMenu(buildMenu());
  listen();
  createDesk(root);

  bossKey = globalShortcut.register(BOSS_KEY, pressBossKey) ? BOSS_KEY : '';
  if (!bossKey) console.warn(`[desk] ${BOSS_KEY} 를 다른 프로그램이 쓰고 있어 보스 키를 등록하지 못했습니다.`);
  sendState();
}

if (!app.requestSingleInstanceLock()) {
  // 보스 키는 한 프로그램만 잡을 수 있다. 이미 떠 있는 창을 앞으로 부른다.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!desk) return;
    if (desk.win.isMinimized()) desk.win.restore();
    desk.win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => globalShortcut.unregisterAll());
  void app.whenReady().then(start);
}
