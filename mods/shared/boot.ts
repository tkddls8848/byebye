/**
 * 확장 프로그램과 데스크톱 셸이 같이 쓰는 시작점.
 *
 * 웹 앱의 `src/main.ts` 는 쓰지 않는다. 그쪽은 개발 서버에서 원격 캡처 스크립트를
 * 부를 수 있고, 확장(MV3)은 원격 코드를 실을 수 없다. 여기서는 실린 자리를 먼저
 * 정한 뒤 같은 화면을 그린다.
 */
import '../../src/styles.css';
import { PUBLIC_ORIGIN, configureHost, type HostConfig } from '../../src/host';
import { mountFire } from '../../src/view';
import { applySavedTheme, coverWorkspace } from '../../src/workspace';

/**
 * 웹 앱이 아닌 자리의 기본값: API 와 공유 링크는 공개 주소를 쓰고, 탭 제목과
 * 주소창은 건드리지 않는다. 진입점마다 필요한 것만 덮어쓴다.
 */
export function bootApp(root: HTMLElement, overrides: Partial<HostConfig> = {}): void {
  configureHost({
    apiBase: PUBLIC_ORIGIN,
    shareBase: PUBLIC_ORIGIN,
    homeHref: '#',
    setTitle: false,
    readShareFromUrl: false,
    ...overrides,
  });
  applySavedTheme();
  // 계산기 CSS 가 기대는 바깥 칸 이름이다(index.html 의 #fire-root 와 같다).
  root.classList.add('fire');
  mountFire(root);
}

export { PUBLIC_ORIGIN, coverWorkspace };
