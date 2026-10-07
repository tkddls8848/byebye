/**
 * 확장 설명서(manifest.json)를 만든다.
 *
 * 크롬·엣지용과 웨일용은 옆 칸을 여는 열쇠만 다르다. 크롬은 `side_panel`,
 * 웨일은 `sidebar_action` 을 쓴다. 나머지(권한·단축키·보안 정책)는 같아야
 * 한쪽만 권한이 늘어나는 일이 없으니 한곳에서 만든다.
 */
import { PUBLIC_ORIGIN } from '../../src/host';

export type Target = 'chrome' | 'whale';

const NAME = 'WORKSHEET 사이드 시트';

const ICONS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

/**
 * 확장 화면의 보안 정책.
 *
 * 기본값(script-src 'self')에 더해, 밖으로 나가는 연결을 공개 주소 하나로 묶고
 * 남의 페이지를 틀에 넣지 못하게 막는다. 코드가 실수로 다른 곳을 부르거나
 * 남의 사이트를 끼워 보여 주려 해도 브라우저가 거절한다.
 * default-src 'self' 는 그림·글꼴·스타일 같은 나머지 자원도 확장 안의 파일로만
 * 묶는다(밖의 그림 한 장으로도 "봤다"는 신호가 나갈 수 있다). 앱은 style 속성 대신
 * CSSOM(element.style)만 쓰므로 인라인 스타일 허용이 필요 없다.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  `connect-src 'self' ${PUBLIC_ORIGIN}`,
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function makeManifest(target: Target, version: string): Record<string, unknown> {
  const common = {
    manifest_version: 3,
    name: NAME,
    short_name: 'WORKSHEET',
    version,
    description: '보고 있는 페이지는 건드리지 않고, 브라우저 옆 칸에 WORKSHEET 문서를 띄웁니다.',
    icons: ICONS,
    background: { service_worker: 'background.js', type: 'module' },
    options_ui: { page: 'options.html', open_in_tab: true },
    // 페이지 내용을 읽을 일이 없으니 content_scripts·scripting·tabs 는 두지 않는다.
    // storage: 업무 탭 주소와 보스 키 상태. host: 예적금 공시 창구(/api/fire/products) 하나.
    host_permissions: [`${PUBLIC_ORIGIN}/*`],
    content_security_policy: { extension_pages: CSP },
  };

  const bossKey = {
    suggested_key: { default: 'Alt+Shift+K' },
    description: '수치를 가리고 옆 칸을 닫은 뒤 업무 탭으로 옮긴다',
  };

  if (target === 'whale') {
    // 웨일은 사이드바에 아이콘이 붙는다. 도구 막대 단추(action)는 두지 않는다 —
    // 눌러도 열 것이 없다. chrome.sidePanel 도 쓰지 않는다(겹치면 칸이 두 개 생긴다).
    return {
      ...common,
      permissions: ['storage'],
      sidebar_action: {
        default_page: 'sidepanel.html',
        default_title: NAME,
        default_icon: { 16: ICONS[16], 32: ICONS[32] },
        use_navigation_bar: false,
      },
      commands: { 'boss-key': bossKey },
    };
  }

  return {
    ...common,
    minimum_chrome_version: '116',
    permissions: ['sidePanel', 'storage'],
    action: { default_title: `${NAME} 열기`, default_icon: ICONS },
    side_panel: { default_path: 'sidepanel.html' },
    commands: {
      // 도구 막대 단추와 같은 일(옆 칸 열기)을 키보드로 한다. Alt+Shift+W 는 크로미움이
      // 받아 주지 않아(리눅스 141 에서 빈 단축키로 남는다) S(Sheet)로 둔다.
      _execute_action: { suggested_key: { default: 'Alt+Shift+S' } },
      'boss-key': bossKey,
    },
  };
}
