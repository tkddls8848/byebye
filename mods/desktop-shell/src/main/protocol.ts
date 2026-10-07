/**
 * worksheet://app/ — 우리 화면을 내주는 주소.
 *
 * 빌드한 파일을 디스크에서 읽어 주고, `/api/` 아래만 공개 주소의 같은 경로로
 * 넘긴다. 그 창구는 우리 Worker 이므로 앱의 상대 주소 `/api/fire/products` 가
 * 웹 앱에서와 똑같이 동작한다(apiBase ''). 남의 사이트 요청은 여기를 지나지
 * 않는다 — 이 처리기는 우리 칸이 쓰는 세션에만 달린다.
 */
import { protocol, type Session } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { PUBLIC_ORIGIN } from '../../../../src/host';

export const SCHEME = 'worksheet';
export const APP_ORIGIN = `${SCHEME}://app`;

/**
 * 우리 화면의 콘텐츠 보안 정책.
 *
 * 스크립트·스타일은 빌드한 파일만, 연결은 같은 출처(`/api/` 중계)만 허용한다.
 * 어떤 원격 주소도 부를 수 없으니, 화면에 무엇이 끼어들어도 숫자를 밖으로 들고
 * 나갈 길이 없다. 틀(iframe)에도 실리지 않는다.
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** 앱이 준비되기 전에 불러야 한다. 표준·보안 출처로 다뤄야 저장소와 fetch 가 된다. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  ]);
}

const plain = (status: number, text: string): Response =>
  new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' } });

/** 빌드한 파일 하나. 폴더 밖을 가리키는 경로는 받지 않는다. */
async function serveFile(root: string, pathname: string): Promise<Response> {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return plain(400, 'bad path');
  }
  if (path === '/' || path === '') path = '/index.html';
  const file = resolve(root, `.${path}`);
  if (!file.startsWith(root + sep)) return plain(404, 'not found');
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    return plain(404, 'not found');
  }
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string> = {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-cache',
  };
  if (type.startsWith('text/html')) {
    headers['content-security-policy'] = CSP;
    headers['cross-origin-opener-policy'] = 'same-origin';
    headers['referrer-policy'] = 'no-referrer';
  }
  return new Response(new Uint8Array(body), { status: 200, headers });
}

/**
 * `/api/*` 를 공개 주소로 넘긴다.
 *
 * 읽기(GET)만, 우리 출처로만 간다. 화면이 보낸 머리글·쿠키는 넘기지 않고, 받은
 * 응답에서도 형식·길이만 돌려준다. 연결이 안 되면 그대로 실패시켜 앱이 원래의
 * "불러오지 못했습니다" 안내를 띄우게 한다.
 */
async function proxyApi(request: Request, url: URL, session: Session): Promise<Response> {
  if (request.method !== 'GET') return plain(405, 'method not allowed');
  const target = new URL(`${url.pathname}${url.search}`, PUBLIC_ORIGIN);
  if (target.origin !== PUBLIC_ORIGIN || !target.pathname.startsWith('/api/')) return plain(404, 'not found');
  let upstream: Response;
  try {
    upstream = await session.fetch(target.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // 연결 실패는 화면 쪽 fetch 의 네트워크 오류로 돌려준다. 앱이 "연결을 확인하라"는
    // 원래 안내를 띄운다.
    return Response.error();
  }
  const headers: Record<string, string> = {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  return new Response(upstream.body, { status: upstream.status, headers });
}

/**
 * 우리 칸들이 쓰는 세션에 처리기를 단다. 실제 사이트 세션에는 달지 않으므로
 * 그쪽에서는 worksheet:// 가 아무것도 열지 못한다.
 */
export function handleAppProtocol(session: Session, root: string): void {
  const base = resolve(root);
  session.protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return plain(404, 'not found');
    if (url.pathname.startsWith('/api/')) return proxyApi(request, url, session);
    return serveFile(base, url.pathname);
  });
}
