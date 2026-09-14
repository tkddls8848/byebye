/**
 * 요청을 가르는 곳.
 *
 * 정적 파일은 Cloudflare 가 그대로 내준다. Worker 가 먼저 손을 대는 자리는 셋뿐이다 —
 * 금융감독원 중계(`/api/*`), 검색엔진에 알리는 두 파일, 그리고 미리보기 글귀를
 * 갈아 끼워야 하는 HTML 이다. 어디에 먼저 끼어들지는 `wrangler.jsonc` 의
 * `run_worker_first` 가 정한다.
 */
import { calculate } from '../src/model';
import { SHARE_PARAM, decodeShare, shareMeta } from '../src/share';
import { applyMeta, renderRobots, renderSitemap } from './meta';
import { handleProducts, type ProductsEnv } from './products';

/** 미리보기 꼬리표를 갈아 끼울 쪽. 나머지는 파일 그대로 내보낸다. */
function isPage(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html' || pathname.startsWith('/guide');
}

/**
 * 공유 링크에 담긴 결과를 미리보기 글귀로 옮긴다.
 *
 * 담긴 게 없거나 읽을 수 없으면 아무것도 돌려주지 않는다. 그러면 문서에 원래
 * 적힌 제목과 설명이 그대로 나간다.
 */
function sharedMeta(url: URL): { title: string; description: string; image: string } | null {
  const input = decodeShare(url.searchParams.get(SHARE_PARAM));
  if (!input) return null;
  try {
    return shareMeta(input, calculate(input));
  } catch {
    // 손으로 고친 주소가 계산을 무너뜨려도 미리보기만 포기하면 된다.
    return null;
  }
}

async function handlePage(request: Request, env: Env, url: URL): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('text/html')) return response;

  const canonical = new URL(url.pathname, url.origin);
  const shared = sharedMeta(url);
  // 카드가 걸어 줄 주소는 공유된 결과까지 담은 것이어야 한다. 남은 물음표 뒤
  // 찌꺼기는 버린다 — 우리가 아는 항목만 다시 붙인다.
  const cardUrl = new URL(canonical);
  if (shared) cardUrl.searchParams.set(SHARE_PARAM, url.searchParams.get(SHARE_PARAM) ?? '');

  const html = applyMeta(await response.text(), {
    url: canonical.toString(),
    cardUrl: cardUrl.toString(),
    ...(shared ?? {}),
  });

  const headers = new Headers(response.headers);
  // 길이가 바뀌었고, 같은 주소가 결과에 따라 다른 문서를 내놓는다.
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(html, { status: response.status, headers });
}

function text(body: string, type: string): Response {
  return new Response(body, {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/fire/products') return handleProducts(request, env);
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: { code: 'not_found', message: '요청한 API가 없습니다.' } }, { status: 404 });
    }

    if (pathname === '/robots.txt') return text(renderRobots(url.origin), 'text/plain; charset=utf-8');
    if (pathname === '/sitemap.xml') {
      return text(renderSitemap(url.origin, new Date().toISOString().slice(0, 10)), 'application/xml; charset=utf-8');
    }

    if (isPage(pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
      return handlePage(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env & ProductsEnv>;
