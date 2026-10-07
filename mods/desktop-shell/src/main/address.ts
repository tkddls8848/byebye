/**
 * 주소 칸에 적은 글을 열 수 있는 주소로 바꾼다.
 *
 * http(s) 만 연다. 형식을 붙이지 않고 적으면 https 로 본다. 검색어처럼 띄어 쓴
 * 글은 받지 않는다 — 셸이 적은 글을 어느 검색 엔진에 대신 보내는 일이 없게 하려는
 * 것이다. 사이트 안의 검색창을 쓰면 된다.
 */
export function normalizeAddress(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return url.toString();
  } catch {
    // 주소로 읽히지 않는다.
  }
  return null;
}

/** 시작 주소. 시험에서는 WORKSHEET_START_URL 로 바꿔 끼운다(http(s) 만). */
export function startUrl(override: string | undefined, fallback: string): string {
  if (!override) return fallback;
  try {
    const url = new URL(override);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    // 아래에서 기본값으로 돌아간다.
  }
  return fallback;
}

export function schemeOf(url: string): 'https' | 'http' | 'other' {
  if (url.startsWith('https:')) return 'https';
  if (url.startsWith('http:')) return 'http';
  return 'other';
}
