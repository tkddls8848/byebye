/**
 * 칸마다 할 수 있는 일을 좁힌다.
 *
 * 실제 사이트 칸은 "보통 브라우저 탭보다 더 할 수 있는 것이 없게" 연다. 셸은 그
 * 칸에 스크립트를 넣지도, 요청·응답 머리글을 고치지도, 페이지 내용을 읽지도
 * 않는다. 셸이 그 칸에서 아는 것은 주소창에 보여 줄 지금 주소뿐이다.
 */
import { app, type Session, type WebContents } from 'electron';
import { APP_ORIGIN } from './protocol';

const isWeb = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * 맞춤법 검사를 끄고 사전 목록도 비운다.
 *
 * Linux·Windows 의 Chromium 은 세션마다 사전(.bdic)을 구글 서버에서 내려받는다.
 * 검사를 끄기만 해서는 그 내려받기가 그대로 나간다(넷 로그로 확인). 사전 목록이
 * 비어 있어야 받으러 가지 않는다. 우리 코드가 바깥으로 내는 요청은 공개 주소의
 * /api/ 하나뿐이어야 한다.
 */
function noSpellcheck(session: Session): void {
  session.setSpellCheckerEnabled(false);
  if (process.platform !== 'darwin') session.setSpellCheckerLanguages([]);
}

/**
 * 실제 사이트 세션: 권한은 모두 거절한다(알림·위치·카메라·클립보드 읽기·
 * 외부 프로그램 열기 포함).
 */
export function guardWebSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
  noSpellcheck(session);
}

/**
 * 우리 세션: 공유 링크 복사에 쓰는 클립보드 쓰기만 우리 출처에 허락한다.
 */
export function guardAppSession(session: Session): void {
  const allowed = (permission: string, origin: string): boolean =>
    permission === 'clipboard-sanitized-write' && origin.startsWith(APP_ORIGIN);
  session.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(allowed(permission, details.requestingUrl ?? '')));
  session.setPermissionCheckHandler((_contents, permission, origin) => allowed(permission, origin));
  session.setDevicePermissionHandler(() => false);
  noSpellcheck(session);
}

/**
 * 실제 사이트 칸의 이동 규칙.
 *
 * - 새 창(window.open, target=_blank)은 따로 띄우지 않고 **같은 칸**에서 연다.
 *   숨은 팝업이 생기면 그 창의 주소를 사람이 볼 수 없다. 같은 칸이면 머리줄
 *   주소 칸이 늘 지금 위치를 보여 준다. 페이지가 location 으로 스스로 갈 수 있는
 *   곳 이상으로 갈 수 있게 되지도 않는다.
 * - 운영체제의 다른 프로그램에는 아무것도 넘기지 않는다(mailto: 포함). 예전에는
 *   window.open('mailto:…') 만 메일 프로그램에 넘겼는데, 사람이 누른 mailto: 링크는
 *   막히고 사람 손 없이 스크립트가 연 것만 통과하는 거꾸로 된 길이었다. 남의 페이지가
 *   메일 창을 마구 띄울 수 있는 길을 두지 않는다.
 * - 칸 자체도 http(s) 밖으로는 가지 않는다(file:, worksheet:, data:, mailto: 등).
 */
export function guardWebContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isWeb(url)) void contents.loadURL(url).catch(() => undefined);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event) => {
    if (!isWeb(event.url)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => {
    if (!isWeb(event.url)) event.preventDefault();
  });
}

/** 우리 칸(머리줄·칸막이·앱)은 worksheet://app/ 밖으로 나가지 않고 새 창도 열지 않는다. */
export function guardAppContents(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => {
    if (!event.url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => {
    if (!event.url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
}

/**
 * 모든 웹 콘텐츠에 공통으로 거는 빗장. 따로 규칙을 받지 못한 콘텐츠가 생겨도
 * webview 를 붙이거나 새 창을 띄우지 못한다.
 */
export function guardEverything(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
  // 사이트가 클라이언트 인증서를 달라고 해도 내주지 않는다. Electron 기본값은 묻지 않고
  // 첫 인증서를 골라 보내서, 사람을 알아볼 수 있는 인증서가 모르는 새 나갈 수 있다.
  app.on('select-client-certificate', (event, _contents, _url, _list, callback) => {
    event.preventDefault();
    callback();
  });
}
