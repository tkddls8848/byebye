import './workspace.css';

const disposers = new WeakMap<HTMLElement, () => void>();
const TITLE = '중장기 운영 계획';
const COVER_KEY = 'worksheet-list-view';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const paths = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  folder: 'M3 7V5h6l2 2h10v13H3z',
  sheet: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h8 M11 10v9',
  chart: 'M4 3v17h17 M8 16v-5 M13 16V7 M18 16V4',
  book: 'M4 4h7l1 2 1-2h7v15h-7l-1 2-1-2H4z M12 6v15',
  search: 'M15 15l6 6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  check: 'M5 12l4 4L19 6',
  arrow: 'M14 6l-6 6 6 6',
  chevron: 'M9 5l7 7-7 7',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
};

export function icon(name: keyof typeof paths): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ws-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}

function button(label: string, symbol: keyof typeof paths, action: () => void, className = 'ws-button'): HTMLButtonElement {
  const node = el('button', className);
  node.type = 'button';
  node.append(icon(symbol), el('span', '', label));
  node.addEventListener('click', action);
  return node;
}

export interface WorkspaceContent {
  calculation: HTMLElement;
  products: HTMLElement;
  guide: HTMLElement;
  shared: boolean;
}

/** Document chrome stays mounted while numerical results redraw. */
export function mountWorkspace(root: HTMLElement, content: WorkspaceContent): void {
  disposers.get(root)?.();
  const events = new AbortController();
  disposers.set(root, () => events.abort());
  const workspace = el('div', 'workspace');
  const header = el('header', 'ws-header');
  const brand = el('a', 'ws-brand');
  brand.href = '/';
  brand.append(el('span', 'ws-brand__mark', 'W'), el('span', '', 'WORKSHEET'));
  const service = el('span', 'ws-service', '드라이브');
  const search = el('form', 'ws-search');
  search.setAttribute('role', 'search');
  const query = el('input');
  query.type = 'search';
  query.placeholder = '문서 이름으로 검색';
  query.setAttribute('aria-label', '문서 이름 검색');
  search.append(icon('search'), query);
  const profile = el('div', 'ws-profile');
  profile.append(el('span', 'ws-profile__name', '개인 작업 공간'), el('span', 'ws-avatar', 'ME'));
  header.append(brand, service, search, profile);

  const sidebar = el('aside', 'ws-sidebar');
  sidebar.id = 'workspace-navigation';
  sidebar.append(el('p', 'ws-sidebar__heading', '내 드라이브'));
  const nav = el('nav', 'ws-nav');
  nav.setAttribute('aria-label', '문서 탐색');
  const main = el('div', 'ws-main');
  const documentView = el('div', 'ws-document');
  const listView = el('section', 'ws-list');
  listView.hidden = true;
  listView.setAttribute('aria-label', '내 드라이브 문서 목록');
  const breadcrumb = el('div', 'ws-breadcrumb');
  breadcrumb.append(el('span', '', '내 드라이브'), icon('chevron'), el('span', '', '계획 자료'), icon('chevron'), el('span', '', TITLE));
  const heading = el('div', 'ws-document__heading');
  const titleGroup = el('div', 'ws-title-group');
  const title = el('h1', '', TITLE);
  title.tabIndex = -1;
  titleGroup.append(el('span', 'ws-file-icon', 'S'), title, el('span', 'ws-badge', '개인 문서'));
  const back = button('목록 보기', 'arrow', () => showList(true));
  back.append(el('kbd', '', 'Esc'));
  back.title = '수치를 숨기고 문서 목록으로 이동 (Esc)';
  heading.append(titleGroup, back);
  const meta = el('div', 'ws-document__meta');
  meta.append(el('span', '', '계획 자료'), el('span', '', '·'), el('span', '', '시뮬레이션 시트'),
    el('span', 'ws-local', content.shared ? '공유된 입력 조건' : '이 브라우저에 저장'));
  const notice = el('div', 'ws-notice');
  notice.append(icon('check'), el('span', '', '입력한 조건에 따라 분석 결과가 자동으로 업데이트됩니다.'),
    el('span', 'ws-notice__unit', '금액 단위 : 만원'));
  const tabs = el('nav', 'ws-document__tabs');
  tabs.setAttribute('aria-label', '문서 영역');
  const sections = [content.calculation, content.products, content.guide];
  const labels = ['분석 시트', '비교 자료', '산출 기준'];
  const tabButtons = labels.map((label, index) => {
    const item = button(label, index === 0 ? 'sheet' : index === 1 ? 'chart' : 'book', () => openSection(index), 'ws-document__tab');
    item.setAttribute('aria-controls', `workspace-section-${index}`);
    tabs.append(item);
    return item;
  });
  sections.forEach((section, index) => {
    section.id = `workspace-section-${index}`;
    section.hidden = index !== 0;
  });
  const info = el('p', 'ws-document__foot', '개인 작업 공간 · 변경한 입력값은 현재 브라우저에 저장됩니다.');
  documentView.append(breadcrumb, heading, meta, tabs, notice, ...sections, info);

  const listTitle = el('h1', '', '내 드라이브');
  listTitle.tabIndex = -1;
  const listHead = el('div', 'ws-list__heading');
  listHead.append(listTitle, el('span', 'ws-list__count', '계획 자료'));
  const listBar = el('div', 'ws-list__bar');
  listBar.append(icon('folder'), el('strong', '', '계획 자료'), el('span', '', '이름순'));
  const files = el('table', 'ws-files');
  const thead = el('thead');
  const tr = el('tr');
  for (const label of ['문서 이름', '유형', '위치']) tr.append(el('th', '', label));
  thead.append(tr);
  const tbody = el('tbody');
  for (const [index, name] of ['중장기 운영 계획', '외부 자료 비교', '산출 기준 및 참고사항'].entries()) {
    const row = el('tr');
    row.dataset.name = name;
    const cell = el('td');
    cell.append(button(name, index === 0 ? 'sheet' : 'book', () => { query.value = ''; filterFiles(); openSection(index); }, 'ws-file-link'));
    row.append(cell, el('td', '', index === 0 ? '시트' : '문서'), el('td', '', '내 드라이브'));
    tbody.append(row);
  }
  files.append(thead, tbody);
  const empty = el('p', 'ws-list__empty', '검색 결과가 없습니다. 다른 문서 이름으로 검색하세요.');
  empty.hidden = true;
  listView.append(listHead, listBar, files, empty);
  main.append(documentView, listView);

  let activeSection = 0;
  const allFiles = button('전체 문서', 'folder', () => showList(true), 'ws-nav__item');
  const navigation = labels.map((label, index) => button(label, index === 0 ? 'sheet' : index === 1 ? 'chart' : 'book', () => openSection(index), 'ws-nav__item'));
  nav.append(allFiles, el('p', 'ws-nav__label', '내 문서'), ...navigation);
  const primary = button('시트 열기', 'sheet', () => openSection(0), 'ws-primary');
  const sidebarFoot = el('div', 'ws-sidebar__foot');
  sidebarFoot.append(icon('shield'), el('strong', '', '나만의 작업 공간'),
    el('p', '', 'Esc를 누르면 문서 목록으로 전환됩니다. 다른 탭으로 이동할 때도 자동 전환됩니다.'));
  sidebar.append(primary, nav, sidebarFoot);
  const mobileMenu = button('메뉴', 'menu', () => {
    const expanded = workspace.classList.toggle('workspace--menu');
    mobileMenu.setAttribute('aria-expanded', String(expanded));
  }, 'ws-mobile-menu');
  mobileMenu.setAttribute('aria-controls', sidebar.id);
  mobileMenu.setAttribute('aria-label', '메뉴');
  mobileMenu.setAttribute('aria-expanded', 'false');
  header.prepend(mobileMenu);
  workspace.append(header, sidebar, main);
  root.replaceChildren(workspace);

  function saveView(covered: boolean): void {
    try { sessionStorage.setItem(COVER_KEY, String(covered)); } catch { /* usable without storage */ }
  }
  function updateNavigation(covered: boolean): void {
    allFiles.setAttribute('aria-current', covered ? 'page' : 'false');
    navigation.forEach((item, index) => item.setAttribute('aria-current', !covered && activeSection === index ? 'page' : 'false'));
    tabButtons.forEach((item, index) => item.setAttribute('aria-current', activeSection === index ? 'page' : 'false'));
    workspace.classList.remove('workspace--menu');
    mobileMenu.setAttribute('aria-expanded', 'false');
  }
  function showList(focus: boolean): void {
    documentView.hidden = true;
    listView.hidden = false;
    document.title = '내 드라이브 · WORKSHEET';
    saveView(true);
    updateNavigation(true);
    if (focus) listTitle.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function openSection(index: number): void {
    activeSection = index;
    sections.forEach((section, position) => { section.hidden = position !== index; });
    const detail = sections[index]!.querySelector('details');
    if (detail && index !== 0) detail.open = true;
    documentView.hidden = false;
    listView.hidden = true;
    document.title = `${TITLE} · WORKSHEET`;
    saveView(false);
    updateNavigation(false);
    title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function filterFiles(): void {
    let count = 0;
    for (const row of tbody.rows) {
      row.hidden = !row.dataset.name!.includes(query.value.trim());
      if (!row.hidden) count += 1;
    }
    empty.hidden = count > 0;
  }
  search.addEventListener('submit', (event) => { event.preventDefault(); showList(false); filterFiles(); });
  query.addEventListener('input', () => { showList(false); filterFiles(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); query.value = ''; filterFiles(); showList(true); }
  }, { signal: events.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { query.value = ''; filterFiles(); showList(false); }
  }, { signal: events.signal });
  let covered = false;
  try { covered = sessionStorage.getItem(COVER_KEY) === 'true'; } catch { /* keep sheet available */ }
  if (covered) showList(false);
  else { document.title = `${TITLE} · WORKSHEET`; updateNavigation(false); }
}
