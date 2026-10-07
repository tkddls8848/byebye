/**
 * 머리줄 동작.
 *
 * 메인 프로세스가 보내 주는 상태(주소·뒤로 갈 수 있는지·불러오는 중인지)를 그린다.
 * 실제 사이트의 내용은 여기에 오지 않는다. 받는 것은 주소뿐이다.
 */
// 색 토큰(--ws-*)은 styles.css 에 있다. workspace.css 는 여기서 부르지 않는다 —
// 공유 조각이 되면 앱 칸에서 fire.css 보다 앞에 붙어 겹침 순서가 달라진다.
import '../../../../src/styles.css';
import './toolbar.css';
import type { DeskState } from '../shared/ipc';
import { followAppTheme } from './theme';

followAppTheme();

const api = window.worksheetDeskChrome;
const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`머리줄에 #${id} 가 없습니다.`);
  return node as T;
};

const bar = $('bar');
const back = $<HTMLButtonElement>('back');
const forward = $<HTMLButtonElement>('forward');
const reload = $<HTMLButtonElement>('reload');
const form = $<HTMLFormElement>('address-form');
const address = $<HTMLInputElement>('address');
const urlView = $('url-view');
const security = $('security');
const failure = $('failure');
const pane = $<HTMLButtonElement>('pane');
const bossKey = $('boss-key');

let state: DeskState | null = null;
/** 사람이 주소 칸에 글을 고치는 중인가. 이동이 일어나면 실제 주소가 이긴다. */
let editing = false;

const span = (className: string, text: string): HTMLSpanElement => {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
};

/**
 * 주소를 세 토막으로 그린다: 형식(과 사용자 정보)은 흐리게, 호스트는 진하게,
 * 나머지 경로는 흐리게. 전체 주소는 그대로 다 보이고, 어느 사이트인지는 한눈에
 * 들어온다. `https://아무개@다른곳/` 같은 주소도 진하게 보이는 쪽은 실제 호스트다.
 */
function paintUrl(href: string): void {
  try {
    const url = new URL(href);
    const userinfo = url.username ? `${url.username}${url.password ? `:${url.password}` : ''}@` : '';
    const head = `${url.protocol}//${userinfo}`;
    if (url.host && href.startsWith(head + url.host)) {
      urlView.replaceChildren(
        span('tb-url__muted', head),
        span('tb-url__host', url.host),
        span('tb-url__muted', href.slice(head.length + url.host.length)),
      );
      return;
    }
  } catch {
    // 주소로 읽히지 않으면 아래처럼 통째로 보인다.
  }
  urlView.replaceChildren(span('', href));
}

function render(next: DeskState): void {
  const moved = state?.url !== next.url;
  state = next;
  back.disabled = !next.canGoBack;
  forward.disabled = !next.canGoForward;
  bar.dataset.loading = String(next.loading);
  reload.setAttribute('aria-label', next.loading ? '멈춤' : '새로 고침');
  reload.title = reload.getAttribute('aria-label')!;

  security.dataset.scheme = next.scheme;
  const secureLabel = next.scheme === 'https' ? '보안 연결(https)' : next.scheme === 'http' ? '보안되지 않은 연결(http)' : '주소';
  security.setAttribute('aria-label', secureLabel);
  security.title = secureLabel;

  // 이동이 일어나면 사람이 적던 글보다 실제 주소가 먼저다.
  if (!editing || moved) {
    editing = false;
    address.value = next.url;
    address.removeAttribute('aria-invalid');
  }
  address.title = next.url;
  paintUrl(next.url);

  failure.hidden = !next.failure;
  failure.textContent = next.failure ? `열지 못함 · ${next.failure}` : '';

  pane.setAttribute('aria-pressed', String(next.paneVisible));
  pane.setAttribute('aria-label', next.paneVisible ? '시트 칸 접기' : '시트 칸 펴기');
  bossKey.hidden = !next.bossKey;
  bossKey.textContent = next.bossKey;
  pane.title = next.bossKey
    ? `${pane.getAttribute('aria-label')} · ${next.bossKey}: 수치를 가리고 바로 접기`
    : `${pane.getAttribute('aria-label')} · 보스 키를 등록하지 못했습니다(다른 프로그램이 사용 중)`;
}

back.addEventListener('click', () => api.nav('back'));
forward.addEventListener('click', () => api.nav('forward'));
reload.addEventListener('click', () => api.nav(state?.loading ? 'stop' : 'reload'));
pane.addEventListener('click', () => api.togglePane());

address.addEventListener('focus', () => address.select());
address.addEventListener('input', () => {
  editing = true;
  address.removeAttribute('aria-invalid');
});
address.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  editing = false;
  address.value = state?.url ?? '';
  address.select();
});
// 칸을 떠나면 적던 글을 버리고 실제 주소로 돌아간다. 주소 칸이 지금 위치가 아닌
// 글을 보인 채 남아 있지 않게 한다.
address.addEventListener('blur', () => {
  editing = false;
  address.value = state?.url ?? '';
  address.removeAttribute('aria-invalid');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void api.go(address.value).then((accepted) => {
    if (accepted) {
      editing = false;
      address.blur();
    } else {
      address.setAttribute('aria-invalid', 'true');
      address.title = 'http(s) 주소만 열 수 있습니다. 검색은 사이트 안의 검색창을 쓰십시오.';
    }
  });
});

api.onFocusAddress(() => {
  address.focus();
  address.select();
});
api.onState(render);
void api.getState().then((initial) => {
  if (initial) render(initial);
});
