/**
 * 앱이 실린 자리.
 *
 * 웹 앱으로 열리면 기본값 그대로 쓴다. 브라우저 확장의 옆 칸이나 남의 페이지에
 * 끼운 틀, 데스크톱 셸처럼 다른 자리에 실릴 때는 진입점이 `configureHost` 로
 * 먼저 바꾼다. 화면 코드는 주소·탭 제목·숨김 동작을 이 값을 보고 정한다.
 */
export interface HostConfig {
  /** 금융감독원 중계 API 의 앞부분. 비우면 지금 출처의 `/api/` 를 쓴다. */
  apiBase: string;
  /** 공유 링크가 가리킬 공개 주소. 비우면 지금 주소를 쓴다. */
  shareBase: string;
  /** 머리글 로고를 눌렀을 때 가는 곳. */
  homeHref: string;
  /** 탭 제목을 문서 이름으로 바꿀지. 남의 페이지 안에 실리면 끈다. */
  setTitle: boolean;
  /** 다른 탭으로 옮겨 가면 문서 목록으로 가릴지. 늘 떠 있는 창에서는 끈다. */
  coverOnHidden: boolean;
  /** 주소창의 공유 결과를 읽고 지울지. 내 주소가 아닌 곳에서는 끈다. */
  readShareFromUrl: boolean;
}

/** 배포된 웹 앱의 공개 주소. 확장·데스크톱 셸이 API 와 공유 링크에 쓴다. */
export const PUBLIC_ORIGIN = 'https://byebye.tkddls8848.workers.dev';

const defaults: HostConfig = {
  apiBase: '',
  shareBase: '',
  homeHref: '/',
  setTitle: true,
  coverOnHidden: true,
  readShareFromUrl: true,
};

let current: HostConfig = { ...defaults };

export function configureHost(next: Partial<HostConfig>): void {
  current = { ...current, ...next };
}

export function host(): Readonly<HostConfig> {
  return current;
}

/** 시험에서 바꾼 값을 되돌린다. */
export function resetHost(): void {
  current = { ...defaults };
}
