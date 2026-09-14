/**
 * 링크 미리보기와 검색엔진이 읽는 부분.
 *
 * ── 왜 Worker 가 손을 대는가 ──────────────────────────────────────────────
 *
 * 카카오톡·슬랙·디스코드·트위터의 미리보기 수집기는 자바스크립트를 돌리지
 * 않는다. 정적 `index.html` 에 적힌 것만 읽고 간다. 그래서 공유 링크에 담긴
 * 결과를 미리보기에 띄우려면 **HTML 이 나가기 전에** 그 자리에서 글귀를
 * 바꿔 끼워야 한다.
 *
 * 주소(origin)를 코드에 박아 두지 않고 들어온 요청에서 읽는 까닭도 같다.
 * `*.workers.dev` 로 열든 나중에 제 도메인을 붙이든, canonical 과 og:url 이
 * 저절로 맞는다. 도메인을 바꿀 때 고칠 자리가 없어야 한다.
 *
 * ── 왜 HTMLRewriter 가 아닌가 ─────────────────────────────────────────────
 *
 * 바꿔야 할 자리가 우리가 적은 표식 사이 한 군데뿐이다. 문자열 함수로 두면
 * `vitest` 가 workerd 없이 그대로 검사할 수 있다. 계산이 맞는지 시험으로
 * 붙드는 이 저장소의 방식에 그편이 맞는다.
 */

/** 표식. `index.html` 과 안내 문서의 `<head>` 안에 있다. */
const START = '<!--meta:start-->';
const END = '<!--meta:end-->';

/** 미리보기 그림의 크기. 만들어 둔 파일과 같아야 한다. */
const IMAGE_SIZE = { width: 1200, height: 630 };

export const SITE_NAME = 'FIRE 계산기';

/** 기본 미리보기 그림. 결과를 담지 않은 링크에 쓴다. */
export const DEFAULT_IMAGE = '/og.png';

/**
 * 사이트맵에 올리는 주소. 새 안내 문서를 더하면 여기에도 적는다.
 *
 * 검색엔진에 알릴 주소를 한곳에 모아 둔다. 파일을 뒤져 만들 수도 있지만,
 * 올릴 것과 올리지 않을 것(예: 공유 링크)을 사람이 정하는 편이 낫다.
 */
export const SITE_PAGES: Array<{ path: string; priority: string }> = [
  { path: '/', priority: '1.0' },
  { path: '/guide/fire-calculator', priority: '0.8' },
  { path: '/guide/4-percent-rule', priority: '0.8' },
  { path: '/guide/deposit-rate', priority: '0.8' },
];

export interface PageMeta {
  /** 이 쪽의 정식 주소 (절대 주소). 검색엔진에는 이것만 알린다. */
  url: string;
  /**
   * 링크 카드가 걸어 줄 주소. 없으면 `url` 을 쓴다.
   *
   * 카카오톡·페이스북은 `og:url` 을 눌렀을 때 갈 곳으로 삼는다. 공유 링크에서
   * 이것을 정식 주소로 두면 눌러 들어온 사람이 결과가 빠진 첫 화면을 보게 된다.
   * 반대로 canonical 까지 공유 주소로 두면 검색엔진이 남의 결과 수천 개를
   * 따로따로 담으려 든다. 그래서 둘을 나눈다.
   */
  cardUrl?: string;
  /** 없으면 문서의 `<title>` 을 쓴다. */
  title?: string;
  /** 없으면 문서의 `<meta name="description">` 를 쓴다. */
  description?: string;
  /** 사이트 안의 경로. 절대 주소로 바꿔 내보낸다. */
  image?: string;
}

/** 속성값 안에서 문서를 깨뜨릴 수 있는 글자를 막는다. */
export function escapeAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pick(html: string, pattern: RegExp): string | undefined {
  const found = pattern.exec(html);
  return found?.[1]?.trim() || undefined;
}

/**
 * 문서가 스스로 밝힌 제목과 설명.
 *
 * 검색 결과에 뜨는 제목과 링크 카드에 뜨는 제목은 쓸모가 다르다. 검색에는
 * "FIRE 계산기 — 은퇴 가능 시점 계산과 예적금 금리 비교" 처럼 찾는 말이 다 들어간
 * 제목이 맞고, 카드에는 "나는 몇 살에 은퇴할 수 있을까" 처럼 눌러 보고 싶은 말이
 * 맞는다. 그래서 문서가 `og:` 를 따로 적어 두었으면 카드에는 그것을 쓴다.
 */
function fromDocument(html: string): {
  title?: string;
  description?: string;
  card?: string;
  cardDescription?: string;
} {
  const title = pick(html, /<title>([\s\S]*?)<\/title>/i);
  const description = pick(html, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const card = pick(html, /<meta\s+property="og:title"\s+content="([^"]*)"/i);
  const cardDescription = pick(html, /<meta\s+property="og:description"\s+content="([^"]*)"/i);
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(card ? { card } : {}),
    ...(cardDescription ? { cardDescription } : {}),
  };
}

/** 만들어 낼 꼬리표에 들어갈 값. 빈자리 없이 다 채워진 상태다. */
interface Resolved {
  url: string;
  cardUrl: string;
  /** 링크 카드에 뜨는 제목. */
  title: string;
  /** 링크 카드에 뜨는 설명. */
  description: string;
  /** 검색 결과에 뜨는 설명. */
  search: string;
  image: string;
}

/** 미리보기 수집기가 읽어 갈 꼬리표를 짓는다. */
export function renderMetaTags(meta: Resolved): string {
  const origin = new URL(meta.url).origin;
  const image = new URL(meta.image, origin).toString();
  const title = escapeAttribute(meta.title);
  const description = escapeAttribute(meta.description);
  const url = escapeAttribute(meta.url);
  const cardUrl = escapeAttribute(meta.cardUrl);

  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta name="description" content="${escapeAttribute(meta.search)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:url" content="${cardUrl}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${escapeAttribute(image)}" />`,
    `<meta property="og:image:width" content="${IMAGE_SIZE.width}" />`,
    `<meta property="og:image:height" content="${IMAGE_SIZE.height}" />`,
    `<meta property="og:image:alt" content="${title}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(image)}" />`,
  ].join('\n    ');
}

/**
 * 표식 사이를 새 꼬리표로 갈아 끼운다.
 *
 * 표식이 없으면 손대지 않고 그대로 돌려준다 — 바꿀 자리를 못 찾았는데 짐작으로
 * 끼워 넣으면 문서가 깨진다. 그럴 바엔 기본 미리보기가 나가는 편이 낫다.
 */
export function applyMeta(html: string, meta: PageMeta): string {
  const head = html.indexOf(START);
  const tail = html.indexOf(END);
  if (head < 0 || tail < head) return html;

  const document = fromDocument(html);
  const filled: Resolved = {
    url: meta.url,
    cardUrl: meta.cardUrl ?? meta.url,
    title: meta.title ?? document.card ?? document.title ?? SITE_NAME,
    description: meta.description ?? document.cardDescription ?? document.description ?? '',
    search: meta.description ?? document.description ?? '',
    image: meta.image ?? DEFAULT_IMAGE,
  };

  return html.slice(0, head + START.length) + '\n    ' + renderMetaTags(filled) + '\n    ' + html.slice(tail);
}

/** robots.txt. 주소가 바뀌어도 사이트맵 줄이 저절로 맞는다. */
export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${new URL('/sitemap.xml', origin).toString()}`,
    '',
  ].join('\n');
}

/** sitemap.xml. 공유 링크(`?s=`)는 같은 쪽의 다른 얼굴이라 올리지 않는다. */
export function renderSitemap(origin: string, today: string): string {
  const entries = SITE_PAGES.map(({ path, priority }) =>
    [
      '  <url>',
      `    <loc>${escapeAttribute(new URL(path, origin).toString())}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}
