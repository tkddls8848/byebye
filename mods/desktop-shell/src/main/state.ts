/**
 * 다음에 열 때 되살릴 창 배치.
 *
 * 앱 데이터 폴더의 작은 JSON 하나에 둔다. 칸 폭·접힘·창 위치만 적고, 실제 사이트의
 * 주소나 방문 기록은 적지 않는다 — 셸이 남의 사이트에서 본 것을 남기지 않게 하려는
 * 것이다. 시작 페이지는 언제나 같은 곳에서 연다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PANE_WIDTH } from './layout';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeskPrefs {
  paneWidth: number;
  paneVisible: boolean;
  bounds: WindowBounds | null;
}

const FILE = 'desk-layout.json';

const defaults: DeskPrefs = { paneWidth: DEFAULT_PANE_WIDTH, paneVisible: true, bounds: null };

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function readBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (!isNumber(x) || !isNumber(y) || !isNumber(width) || !isNumber(height)) return null;
  return { x, y, width, height };
}

export function loadPrefs(dir: string): DeskPrefs {
  try {
    const raw = JSON.parse(readFileSync(join(dir, FILE), 'utf8')) as Record<string, unknown>;
    return {
      paneWidth: isNumber(raw.paneWidth) ? raw.paneWidth : defaults.paneWidth,
      paneVisible: typeof raw.paneVisible === 'boolean' ? raw.paneVisible : defaults.paneVisible,
      bounds: readBounds(raw.bounds),
    };
  } catch {
    // 처음 열었거나 파일이 깨졌다. 기본 배치로 연다.
    return { ...defaults };
  }
}

export function savePrefs(dir: string, prefs: DeskPrefs): void {
  try {
    writeFileSync(join(dir, FILE), `${JSON.stringify(prefs, null, 2)}\n`);
  } catch {
    // 저장하지 못해도 지금 창은 그대로 쓸 수 있다.
  }
}
