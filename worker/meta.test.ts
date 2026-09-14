import { describe, expect, it } from 'vitest';

import { applyMeta, escapeAttribute, renderRobots, renderSitemap, SITE_PAGES } from './meta';

const page = [
  '<!doctype html>',
  '<html lang="ko"><head>',
  '<title>FIRE 계산기</title>',
  '<!--meta:start-->',
  '<meta name="description" content="기본 설명" />',
  '<meta property="og:title" content="기본 제목" />',
  '<!--meta:end-->',
  '</head><body>본문</body></html>',
].join('\n');

describe('미리보기 꼬리표 갈아 끼우기', () => {
  it('표식 사이만 바꾸고 나머지는 그대로 둔다', () => {
    const out = applyMeta(page, { url: 'https://example.com/', title: '42세부터 은퇴 가능' });
    expect(out).toContain('<title>FIRE 계산기</title>');
    expect(out).toContain('<body>본문</body>');
    expect(out).not.toContain('기본 제목');
    expect(out).toContain('<meta property="og:title" content="42세부터 은퇴 가능" />');
  });

  it('제목과 설명을 주지 않으면 문서가 밝힌 것을 쓴다', () => {
    const plain = page.replace('<meta property="og:title" content="기본 제목" />', '');
    const out = applyMeta(plain, { url: 'https://example.com/guide/4-percent-rule' });
    expect(out).toContain('<meta property="og:title" content="FIRE 계산기" />');
    expect(out).toContain('<meta name="description" content="기본 설명" />');
  });

  it('문서가 og: 를 따로 적어 두었으면 카드에는 그것을 쓴다', () => {
    const out = applyMeta(page, { url: 'https://example.com/' });
    // 카드에는 눌러 보고 싶은 말이, 검색에는 찾는 말이 다 들어간 제목이 간다.
    expect(out).toContain('<meta property="og:title" content="기본 제목" />');
    expect(out).toContain('<meta name="twitter:title" content="기본 제목" />');
    expect(out).toContain('<meta name="description" content="기본 설명" />');
  });

  it('공유된 결과가 있으면 카드와 검색 설명을 모두 그것으로 덮는다', () => {
    const out = applyMeta(page, { url: 'https://example.com/', description: '42세부터 은퇴 가능' });
    expect(out).toContain('<meta name="description" content="42세부터 은퇴 가능" />');
    expect(out).toContain('<meta property="og:description" content="42세부터 은퇴 가능" />');
    expect(out).not.toContain('기본 설명');
  });

  it('그림 경로를 절대 주소로 바꾼다', () => {
    const out = applyMeta(page, { url: 'https://example.com/', image: '/og-possible.png' });
    expect(out).toContain('<meta property="og:image" content="https://example.com/og-possible.png" />');
    expect(out).toContain('<meta name="twitter:image" content="https://example.com/og-possible.png" />');
  });

  it('그림을 주지 않으면 기본 그림을 쓴다', () => {
    const out = applyMeta(page, { url: 'https://example.com/' });
    expect(out).toContain('content="https://example.com/og.png"');
  });

  it('canonical 과 og:url 이 들어온 주소를 따른다', () => {
    const out = applyMeta(page, { url: 'https://fire.example.kr/guide/deposit-rate' });
    expect(out).toContain('<link rel="canonical" href="https://fire.example.kr/guide/deposit-rate" />');
    expect(out).toContain('<meta property="og:url" content="https://fire.example.kr/guide/deposit-rate" />');
  });

  it('공유 링크에서 카드는 결과가 담긴 주소를, canonical 은 정식 주소를 가리킨다', () => {
    const out = applyMeta(page, { url: 'https://example.com/', cardUrl: 'https://example.com/?s=1_35_50' });
    // 눌러 들어온 사람은 그 결과를 봐야 하고, 검색엔진은 같은 쪽 하나만 담아야 한다.
    expect(out).toContain('<meta property="og:url" content="https://example.com/?s=1_35_50" />');
    expect(out).toContain('<link rel="canonical" href="https://example.com/" />');
  });

  it('큰 그림 카드로 뜨게 한다', () => {
    const out = applyMeta(page, { url: 'https://example.com/' });
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(out).toContain('<meta property="og:image:width" content="1200" />');
    expect(out).toContain('<meta property="og:image:height" content="630" />');
  });

  it('표식이 없으면 손대지 않는다', () => {
    const plain = '<html><head><title>다른 문서</title></head></html>';
    expect(applyMeta(plain, { url: 'https://example.com/' })).toBe(plain);
  });

  it('제목에 따옴표나 꺾쇠가 있어도 문서를 깨뜨리지 않는다', () => {
    const out = applyMeta(page, { url: 'https://example.com/', title: '"><script>alert(1)</script>' });
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('속성값을 벗어날 수 있는 글자를 모두 바꾼다', () => {
    expect(escapeAttribute('a&b<c>d"e')).toBe('a&amp;b&lt;c&gt;d&quot;e');
  });
});

describe('검색엔진에 알리는 파일', () => {
  it('robots.txt 가 들어온 주소로 사이트맵을 가리킨다', () => {
    const out = renderRobots('https://fire.example.kr');
    expect(out).toContain('User-agent: *');
    expect(out).toContain('Sitemap: https://fire.example.kr/sitemap.xml');
  });

  it('sitemap.xml 이 올릴 쪽을 모두 담는다', () => {
    const out = renderSitemap('https://fire.example.kr', '2026-09-14');
    for (const { path } of SITE_PAGES) {
      expect(out).toContain(`<loc>https://fire.example.kr${path === '/' ? '/' : path}</loc>`);
    }
    expect(out).toContain('<lastmod>2026-09-14</lastmod>');
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});
