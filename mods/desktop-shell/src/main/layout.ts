/**
 * 창 안의 네 칸을 어디에 둘지 셈한다.
 *
 *   ┌──────────────── 머리줄 44px ────────────────┐
 *   │ 실제 사이트          │칸│ WORKSHEET (400px) │
 *   └──────────────────────┴──┴───────────────────┘
 *
 * Electron 을 부르지 않는 순수한 셈이라 따로 떼어 둔다. 창 크기가 바뀌거나
 * 칸막이를 끌 때마다 같은 함수로 다시 놓는다.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TOOLBAR_HEIGHT = 44;
export const SPLITTER_WIDTH = 6;
/** 앱이 좁은 화면 배치(≤700px)로 그려지는 기본 폭. */
export const DEFAULT_PANE_WIDTH = 400;
export const MIN_PANE_WIDTH = 320;
/** 실제 사이트가 이보다 좁아지면 쓸 수 없다. */
export const MIN_WEB_WIDTH = 360;
/** 창의 최소 크기. 세 칸이 모두 최소 폭으로 들어가는 넓이다. */
export const MIN_WINDOW_WIDTH = MIN_WEB_WIDTH + SPLITTER_WIDTH + MIN_PANE_WIDTH;
export const MIN_WINDOW_HEIGHT = 420;

export interface Layout {
  toolbar: Rect;
  web: Rect;
  splitter: Rect;
  app: Rect;
  /** 실제로 쓴 앱 칸 폭. 창이 좁으면 저장된 값보다 작아진다. */
  paneWidth: number;
}

/** 원하는 폭을 지금 창에 들어가는 범위로 자른다. */
export function clampPaneWidth(wanted: number, contentWidth: number): number {
  const max = Math.max(MIN_PANE_WIDTH, contentWidth - SPLITTER_WIDTH - MIN_WEB_WIDTH);
  const value = Number.isFinite(wanted) ? Math.round(wanted) : DEFAULT_PANE_WIDTH;
  return Math.min(Math.max(value, MIN_PANE_WIDTH), max);
}

/**
 * 칸을 놓는다. 앱 칸이 접혀 있으면 실제 사이트가 머리줄 아래를 다 차지한다.
 * 칸막이와 앱 칸은 펼쳤을 때의 자리를 그대로 지닌 채 숨긴다 — 다시 펼 때 앱이
 * 폭을 새로 셈하지 않아 바로 돌아온다.
 */
export function computeLayout(width: number, height: number, paneVisible: boolean, wantedPane: number): Layout {
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
    paneWidth,
  };
}
