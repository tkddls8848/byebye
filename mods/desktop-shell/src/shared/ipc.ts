/**
 * 셸의 메인 프로세스와 우리 화면(머리줄·칸막이·WORKSHEET 칸)이 주고받는 말.
 *
 * 실제 사이트 칸은 여기에 끼지 않는다. 그 칸에는 프리로드가 없어서 이 이름들을
 * 부를 길이 처음부터 없다.
 */

/** 앱 칸에 "수치를 가려라"를 알린다. 메인 → 앱 칸 프리로드. */
export const COVER = 'desk:cover';

/** 머리줄이 처음 뜰 때 지금 상태를 묻는다. 머리줄 → 메인(invoke). */
export const GET_STATE = 'desk:get-state';
/** 상태가 바뀔 때마다 머리줄에 보낸다. 메인 → 머리줄. */
export const STATE = 'desk:state';
/** 뒤로·앞으로·새로 고침·멈춤. 머리줄 → 메인. */
export const NAV = 'desk:nav';
/** 주소 칸에 적은 곳으로 간다. 머리줄 → 메인(invoke, 받아들였는지 돌려준다). */
export const GO = 'desk:go';
/** 오른쪽 칸을 접거나 편다. 머리줄 → 메인. */
export const TOGGLE_PANE = 'desk:toggle-pane';
/** 주소 칸에 커서를 둔다(Ctrl+L). 메인 → 머리줄. */
export const FOCUS_ADDRESS = 'desk:focus-address';

/** 칸막이 끌기. 칸막이 → 메인. */
export const SPLIT_START = 'desk:split-start';
export const SPLIT_MOVE = 'desk:split-move';
export const SPLIT_END = 'desk:split-end';
/** 칸막이를 두 번 누르면 기본 폭으로, 화살표 키로는 조금씩 옮긴다. */
export const SPLIT_RESET = 'desk:split-reset';
export const SPLIT_STEP = 'desk:split-step';

export type NavAction = 'back' | 'forward' | 'reload' | 'stop';

/** 머리줄이 그리는 데 필요한 것만. 페이지 내용은 담지 않는다 — 주소뿐이다. */
export interface DeskState {
  /** 실제 사이트 칸의 지금 주소. 줄이지 않고 그대로 보인다. */
  url: string;
  /** 주소의 형식만 본다: https 인가, http 인가, 그 밖인가. */
  scheme: 'https' | 'http' | 'other';
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** 마지막으로 열지 못한 이유(Chromium 오류 이름). 열리면 비운다. */
  failure: string;
  paneVisible: boolean;
  /** 보스 키로 접혔는지. 머리줄 단추의 글귀만 바뀐다. */
  covered: boolean;
  /** 등록된 보스 키. 다른 프로그램이 먼저 잡아 등록하지 못했으면 빈 문자열. */
  bossKey: string;
}

/** 칸막이와 머리줄 프리로드가 내놓는 창구. */
export interface DeskChromeApi {
  getState(): Promise<DeskState>;
  onState(listener: (state: DeskState) => void): void;
  onFocusAddress(listener: () => void): void;
  nav(action: NavAction): void;
  go(input: string): Promise<boolean>;
  togglePane(): void;
  splitStart(screenX: number): void;
  splitMove(screenX: number): void;
  splitEnd(): void;
  splitReset(): void;
  splitStep(delta: number): void;
}

/** 앱 칸 프리로드가 내놓는 창구. 가리라는 신호를 받는 것 하나뿐이다. */
export interface DeskAppApi {
  onCover(listener: () => void): void;
}
