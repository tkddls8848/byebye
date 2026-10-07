/**
 * 사이드 시트의 서비스 워커.
 *
 * 하는 일은 셋뿐이다. 도구 막대 단추로 옆 칸이 열리게 하고, 보스 키를 받아
 * 확장 화면들을 가리고 닫고, 사용자가 정해 둔 업무 탭을 앞으로 가져온다.
 * 어느 탭의 주소·제목·내용도 읽지 않는다(그럴 권한도 없다).
 */
import { checkDecoyUrl } from './decoy';
import { BOSS, DECOY_URL, SESSION, type BossMessage, type BossReply } from './protocol';

// 단추를 누르면 옆 칸이 열리게 한다. 웨일에는 chrome.sidePanel 이 없다 —
// 사이드바 아이콘이 그 일을 한다.
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
}

export interface BossReport {
  /** 신호를 받고 가린 화면이 있었는가(가장 먼저 답한 화면의 자리). */
  covered: BossReply['role'] | null;
  /** 옆 칸을 닫으려고 쓴 방법들. */
  closed: string[];
  /** 업무 탭: 끔 / 새로 엶 / 앞으로 가져옴 / 실패. */
  decoy: 'off' | 'created' | 'focused' | 'failed';
}

/**
 * 보스 키를 받은 보통 브라우저 창.
 *
 * 미니 창(팝업)에서 눌렀으면 단축키가 넘기는 창 번호는 그 팝업이고, 팝업은 신호를 받자마자
 * 스스로 닫힌다. 닫히는 창을 대상으로 삼지 않게 그 뒤의 보통 창을 고른다.
 */
async function normalWindowId(given?: number): Promise<number | undefined> {
  if (given !== undefined && given >= 0) {
    try {
      const win = await chrome.windows.get(given);
      if (win.type === 'normal') return win.id;
    } catch { /* 이미 닫혔다 */ }
  }
  try {
    return (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
  } catch {
    return undefined;
  }
}

/**
 * 이 확장의 옆 칸이 하나라도 열려 있는가. getContexts 는 권한 없이 확장 자신의 화면만 본다.
 * (옆 칸 컨텍스트의 windowId 는 크로미움 141 에서 -1 로 온다. 어느 창인지는 알려 주지 않는다.)
 */
async function anyPanelOpen(): Promise<boolean> {
  try {
    return (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.SIDE_PANEL] })).length > 0;
  } catch {
    // 알 수 없으면 닫아 본다. 보통 창에만 부르므로 해가 없다.
    return true;
  }
}

/** 열려 있는 확장 화면 모두에게 가리라고 알린다. 화면은 가린 뒤 스스로 닫는다. */
async function coverViews(): Promise<BossReply['role'] | null> {
  const message: BossMessage = { type: BOSS };
  try {
    const reply = (await chrome.runtime.sendMessage(message)) as BossReply | undefined;
    return reply?.role ?? null;
  } catch {
    // 받을 화면이 하나도 없으면 여기로 온다. 가릴 것이 없다는 뜻이다.
    return null;
  }
}

/**
 * 옆 칸을 닫는다.
 *
 * 화면이 신호를 받자마자 window.close() 로 스스로 닫으므로 보통은 여기 올 때 이미 닫혀 있다.
 * 브라우저가 그것을 막는 경우에 대비해, 옆 칸이 아직 열려 있으면 브라우저 쪽 API 로도 닫는다.
 *
 * sidePanel.close 는 보통 브라우저 창에만 부른다. 미니 창(팝업)에서 보스 키를 누르면 그 팝업이
 * 스스로 닫히는 중인데, 크로미움 141 은 닫히는 창에 sidePanel.close 가 닿으면 브라우저가
 * 통째로 죽는다(실측: 브라우저 프로세스 SIGSEGV). 보스 키가 브라우저를 죽이면 안 된다.
 */
async function closePanels(windowId: number | undefined): Promise<string[]> {
  const used: string[] = [];
  if (chrome.sidePanel?.close && (await anyPanelOpen())) {
    // 보스 키를 받은 창을 먼저, 그다음 다른 보통 창. 열린 칸이 없는 창에서는 아무 일도 없다.
    const others = await chrome.windows.getAll({ windowTypes: ['normal'] }).catch(() => [] as chrome.windows.Window[]);
    const ids = [...new Set([windowId, ...others.map((win) => win.id)])].filter((id): id is number => id !== undefined);
    for (const id of ids) {
      try {
        await chrome.sidePanel.close({ windowId: id });
        used.push(`sidePanel.close(${id})`);
      } catch { /* 그 사이 닫혔다 */ }
    }
  }
  const sidebar = globalThis.whale?.sidebarAction;
  if (sidebar?.hide && windowId !== undefined) {
    try {
      sidebar.hide(windowId);
      used.push('whale.sidebarAction.hide');
    } catch { /* 웨일 사이드바가 다른 앱을 보고 있다 */ }
  }
  return used;
}

/**
 * 업무 탭을 앞으로 가져온다.
 *
 * 처음에는 새 탭으로 열고 번호만 기억한다. 다음부터는 그 탭을 앞으로 가져온다.
 * 그 사이 사용자가 탭에서 다른 곳으로 옮겨 갔어도 되돌리지 않는다 — 주소를
 * 읽지 않으니 알 수도 없고, 거기서 하던 일을 덮어쓰면 안 된다.
 */
async function bringDecoy(windowId: number | undefined): Promise<BossReport['decoy']> {
  const stored = await chrome.storage.local.get(DECOY_URL);
  const raw = stored[DECOY_URL];
  const checked = checkDecoyUrl(typeof raw === 'string' ? raw : '');
  if (!checked.ok || checked.url === '') return 'off';

  const session = await chrome.storage.session.get(SESSION.decoyTabId);
  const known = session[SESSION.decoyTabId];
  if (typeof known === 'number') {
    try {
      const tab = await chrome.tabs.update(known, { active: true });
      if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      return 'focused';
    } catch {
      // 사용자가 그 탭을 닫았다. 새로 연다.
    }
  }
  try {
    // 탭을 만든 창을 앞으로 올린다. 미니 창(팝업)이 앞에 있었으면 그 뒤에 가려 보이지 않는다.
    const tab = await chrome.tabs.create({ url: checked.url, active: true, ...(windowId !== undefined ? { windowId } : {}) });
    if (tab.id !== undefined) await chrome.storage.session.set({ [SESSION.decoyTabId]: tab.id });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
    return 'created';
  } catch {
    return 'failed';
  }
}

/** 보스 키. 가리기 → 닫기 → 업무 탭 순서다. 가리는 것이 가장 먼저다. */
async function bossKey(windowId?: number): Promise<BossReport> {
  // 다음에 여는 화면도 목록으로 시작하게 먼저 적어 둔다.
  await chrome.storage.session.set({ [SESSION.coverOnNextOpen]: true });
  const covered = await coverViews();
  const target = await normalWindowId(windowId);
  const closed = await closePanels(target);
  const decoy = await bringDecoy(target);
  return { covered, closed, decoy };
}

chrome.commands.onCommand.addListener((command, tab) => {
  // tab 에서는 창 번호만 쓴다. tabs 권한이 없어 주소·제목은 애초에 비어 온다.
  if (command === 'boss-key') void bossKey(tab?.windowId);
});

// 업무 탭 주소가 바뀌면 예전 탭 번호는 버린다. 다음 보스 키에 새 주소로 연다.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && DECOY_URL in changes) void chrome.storage.session.remove(SESSION.decoyTabId);
});

// 자동 시험은 단축키를 누를 수 없다. 같은 처리를 서비스 워커 안에서 부를 수
// 있게 열어 둔다. 서비스 워커 바깥(페이지·다른 확장)에서는 보이지 않는다.
// worksheetClosePanels 는 보스 신호 없이 브라우저 쪽 닫기(화면이 스스로 못 닫을 때의 대비책)만 따로 시험하는 데 쓴다.
Object.assign(globalThis, { worksheetBossKey: bossKey, worksheetClosePanels: closePanels });
