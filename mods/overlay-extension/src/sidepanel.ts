/**
 * 옆 칸 화면.
 *
 * 앱을 싣고, 위 도구 막대의 단추(미니 창·설정)를 붙이고, 보스 키를 받으면
 * 가린 뒤 스스로 닫는다.
 */
import { startView } from './view-host';
import { MINI_SIZE, SESSION } from './protocol';
import './panel.css';

const root = document.getElementById('app');
const miniButton = document.getElementById('mini-button') as HTMLButtonElement | null;
const miniLabel = document.getElementById('mini-label');
const settingsButton = document.getElementById('settings-button');
const bossHint = document.getElementById('boss-hint');
if (!root || !miniButton || !miniLabel || !settingsButton || !bossHint) {
  throw new Error('사이드 시트 화면의 칸을 찾지 못했습니다.');
}

const MINI_TITLE = '중장기 운영 계획 · WORKSHEET';

/** 어떤 길로 미니 창을 열었는지 남긴다. 시험과 문제 확인에 쓴다. */
type MiniPath = 'pip' | 'popup' | 'failed';

function paintMiniButton(open: boolean): void {
  miniLabel!.textContent = open ? '미니 창 닫기' : '미니 창';
  miniButton!.setAttribute('aria-pressed', String(open));
}

/**
 * 문서 PiP 창을 채운다.
 *
 * 앱은 전역 document 에 그리므로 PiP 창에 바로 그릴 수 없다. 확장 페이지
 * (mini.html)를 틀로 넣어 앱이 자기 문서를 갖게 한다. 같은 확장 주소라 정책상
 * 허용되는 유일한 틀이다(frame-src 'self').
 */
function fillPip(win: Window): void {
  const doc = win.document;
  doc.title = MINI_TITLE;
  doc.documentElement.style.height = '100%';
  Object.assign(doc.body.style, { margin: '0', height: '100%' });
  const frame = doc.createElement('iframe');
  frame.title = '중장기 운영 계획';
  frame.src = chrome.runtime.getURL('mini.html');
  Object.assign(frame.style, { display: 'block', width: '100%', height: '100%', border: '0' });
  doc.body.append(frame);
  win.addEventListener('pagehide', () => paintMiniButton(false));
}

/** 문서 PiP 가 안 되는 곳에서는 작은 팝업 창을 띄운다. 권한이 따로 필요 없다. */
async function openPopup(): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION.miniWindowId);
  const known = stored[SESSION.miniWindowId];
  if (typeof known === 'number') {
    try {
      await chrome.windows.update(known, { focused: true });
      return;
    } catch { /* 사용자가 닫았다. 새로 연다 */ }
  }
  // 지금 브라우저 창의 오른쪽 위에 붙여 띄운다. 창 위치·크기는 권한 없이 알 수 있다.
  const place: { left?: number; top?: number } = {};
  try {
    const current = await chrome.windows.getCurrent();
    if (current.left !== undefined && current.width !== undefined && current.top !== undefined) {
      place.left = Math.max(0, current.left + current.width - MINI_SIZE.width - 24);
      place.top = current.top + 96;
    }
  } catch { /* 브라우저가 정한 자리에 둔다 */ }
  const win = await chrome.windows.create({
    type: 'popup',
    url: chrome.runtime.getURL('mini.html'),
    ...MINI_SIZE,
    ...place,
    focused: true,
  });
  if (win?.id !== undefined) await chrome.storage.session.set({ [SESSION.miniWindowId]: win.id });
}

/**
 * 문서 PiP 를 기다리는 시간. 약속이 끝나지 않는 브라우저에 대비한 안전장치다.
 *
 * (자동화 도구가 붙어 있으면 새 PiP 창이 "디버거 대기"로 멈추고, 같은 렌더러를 쓰는
 * 옆 칸까지 함께 멈춘다. 그것은 시험 환경의 일이고 실제 사용과는 무관하다.)
 */
const PIP_WAIT_MS = 1200;
/**
 * PiP 창이 정말 살아 있는지 보기 전에 기다리는 시간.
 *
 * 크로미움 141 의 옆 칸은 requestWindow 에 창을 돌려준 뒤 2~3ms 만에 스스로 닫거나
 * (크기 0), 이유 없이(undefined) 거절한다. 탭에서는 바로 제 크기로 뜬다. 돌려받았다고
 * 믿으면 단추를 눌러도 아무것도 안 보이니, 잠깐 뒤에 살아 있는지 확인한다.
 */
const PIP_SETTLE_MS = 300;
/** 이 칸에서 PiP 가 안 된다는 것을 한 번 겪으면 다음부터는 곧장 팝업으로 간다. */
let pipUnusable = false;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function requestPip(pip: DocumentPictureInPicture): Promise<Window | null> {
  let gaveUp = false;
  const request = pip.requestWindow({ ...MINI_SIZE }).then((win) => {
    // 기다림을 포기하고 팝업을 띄운 뒤에야 열렸다면 겹치지 않게 닫는다.
    if (gaveUp) {
      win.close();
      return null;
    }
    return win;
  });
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), PIP_WAIT_MS));
  const result = await Promise.race([request, timeout]);
  if (result === 'timeout') {
    gaveUp = true;
    document.documentElement.dataset.pipError = `timeout after ${PIP_WAIT_MS}ms`;
    return null;
  }
  return result;
}

/** 돌려받은 PiP 창이 닫히지 않고 화면에 크기를 가진 채 남아 있는가. */
async function pipSurvived(pip: DocumentPictureInPicture, win: Window): Promise<boolean> {
  await sleep(PIP_SETTLE_MS);
  return !win.closed && pip.window === win && win.innerWidth > 0;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `rejected: ${String(error)}`;
}

async function openMini(): Promise<MiniPath> {
  const pip = window.documentPictureInPicture;
  if (pip && !pipUnusable) {
    // 이미 떠 있으면 단추는 닫기로 쓴다.
    if (pip.window) {
      pip.window.close();
      paintMiniButton(false);
      return 'pip';
    }
    try {
      const win = await requestPip(pip);
      if (win) {
        // 먼저 채워 두면 확인하는 동안 앱이 틀 안에서 그려진다.
        fillPip(win);
        if (await pipSurvived(pip, win)) {
          paintMiniButton(true);
          return 'pip';
        }
        win.close();
        document.documentElement.dataset.pipError = 'closed right after opening';
      }
    } catch (error) {
      // 브라우저가 거절했다. 그 까닭을 남기고 팝업으로 간다.
      document.documentElement.dataset.pipError = describeError(error);
    }
    pipUnusable = true;
    paintMiniButton(false);
  } else if (!pip) {
    document.documentElement.dataset.pipError = 'unsupported';
  }
  try {
    await openPopup();
    return 'popup';
  } catch {
    return 'failed';
  }
}

miniButton.addEventListener('click', () => {
  // PiP 를 기다리는 동안 두 번 눌러 창이 둘 뜨지 않게 막는다.
  miniButton.disabled = true;
  void openMini().then((path) => {
    document.documentElement.dataset.miniPath = path;
    miniButton.disabled = false;
  });
});

settingsButton.addEventListener('click', () => void chrome.runtime.openOptionsPage());

// 보스 키의 지금 단축키를 보여 준다. 사용자가 바꿨으면 바뀐 것이, 다른 확장과
// 겹쳐 비어 있으면 아무것도 보이지 않는다.
void chrome.commands.getAll().then((commands) => {
  const shortcut = commands.find((command) => command.name === 'boss-key')?.shortcut;
  if (!shortcut) return;
  bossHint.replaceChildren('닫기 ', Object.assign(document.createElement('kbd'), { textContent: shortcut }));
  bossHint.title = '수치를 가리고 이 칸을 닫습니다';
  bossHint.hidden = false;
});

void startView(root, {
  role: 'panel',
  afterCover: () => {
    // 미니 창(PiP)은 이 칸에 딸려 있어 같이 닫힌다. 먼저 닫아 두면 더 빨리 사라진다.
    window.documentPictureInPicture?.window?.close();
    // 서비스 워커도 chrome.sidePanel.close 로 닫는다. 둘 중 먼저 닿는 쪽이 닫는다.
    window.close();
  },
});
