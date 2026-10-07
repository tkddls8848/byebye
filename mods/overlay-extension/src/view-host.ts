/**
 * 확장 화면(옆 칸·미니 창)에 앱을 싣는 공통 부분.
 *
 * 앱은 확장 자신의 주소(chrome-extension://…)에서 돈다. 입력값·화면 밝기는 그
 * 주소의 localStorage 에 남고, 사용자가 보고 있는 페이지의 저장소에는 닿지 않는다.
 */
import { bootApp, coverWorkspace } from '../../shared/boot';
import { SESSION, isBossMessage, type BossReply, type ViewRole } from './protocol';

export interface ViewOptions {
  role: ViewRole;
  /** 가린 뒤 할 일. 옆 칸·따로 띄운 창은 스스로 닫는다. */
  afterCover: () => void;
}

export async function startView(root: HTMLElement, options: ViewOptions): Promise<void> {
  // 보스 키가 눌린 뒤 처음 여는 화면이면 목록으로 시작한다. 그리기 전에 알아 둬야
  // 수치가 한 번이라도 비치지 않는다.
  let startCovered = false;
  try {
    const stored = await chrome.storage.session.get(SESSION.coverOnNextOpen);
    startCovered = stored[SESSION.coverOnNextOpen] === true;
    if (startCovered) await chrome.storage.session.remove(SESSION.coverOnNextOpen);
  } catch { /* 저장소가 없어도 화면은 연다 */ }

  // coverOnHidden: 옆 칸과 미니 창은 탭을 옮겨도 그대로 보인다. 숨김 신호는 창을
  // 내렸을 때만 오는데, 그때는 어차피 아무도 못 본다. 가리는 일은 Esc 와 보스 키가 맡는다.
  bootApp(root, { coverOnHidden: false });
  if (startCovered) coverWorkspace();
  root.dataset.ready = 'true';

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    // 이 확장 자신이 보낸 것만 듣는다.
    if (sender.id !== chrome.runtime.id || !isBossMessage(message)) return;
    coverWorkspace();
    const reply: BossReply = { role: options.role };
    sendResponse(reply);
    options.afterCover();
  });
}
