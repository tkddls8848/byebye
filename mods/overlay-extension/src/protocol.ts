/**
 * 서비스 워커와 확장 화면(옆 칸·미니 창·설정)이 주고받는 약속.
 *
 * 모두 확장 안에서만 오간다. 사용자가 보고 있는 페이지에는 아무것도 보내지
 * 않고, 그 페이지에서 아무것도 받지 않는다.
 */

/** 보스 키 신호. 받은 화면은 수치를 가리고 스스로 닫는다. */
export const BOSS = 'worksheet:boss';

export interface BossMessage {
  type: typeof BOSS;
}

export function isBossMessage(value: unknown): value is BossMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === BOSS;
}

/** 화면이 어느 자리에 실렸는가. 닫는 방법이 자리마다 다르다. */
export type ViewRole = 'panel' | 'mini-popup' | 'mini-frame';

export interface BossReply {
  role: ViewRole;
}

/** chrome.storage.local — 업무 탭 주소. 사용자가 설정에서 적는다. */
export const DECOY_URL = 'decoyUrl';

/** chrome.storage.session — 브라우저를 끄면 사라지는 값들. */
export const SESSION = {
  /** 보스 키가 눌린 뒤 처음 여는 화면은 문서 목록으로 시작한다. */
  coverOnNextOpen: 'coverOnNextOpen',
  /** 업무 탭으로 열어 둔 탭 번호. 주소는 적지 않는다 — 읽을 수도 없다. */
  decoyTabId: 'decoyTabId',
  /** 따로 띄운 미니 창 번호. 두 번 누르면 새로 열지 않고 앞으로 가져온다. */
  miniWindowId: 'miniWindowId',
} as const;

export const MINI_SIZE = { width: 380, height: 640 } as const;
