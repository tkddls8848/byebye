#!/usr/bin/env node
/**
 * WORKSHEET 데스크 종단 시험.
 *
 * 빌드는 하지 않는다. 먼저 빌드한 뒤 돌린다.
 *
 *   node mods/desktop-shell/build.mjs
 *   NODE_PATH=/opt/node22/lib/node_modules xvfb-run -a node mods/desktop-shell/e2e.mjs --no-sandbox
 *
 * 실제 포털 대신 mods/fixtures/search-mock.html 을 이 스크립트가 직접 띄운 작은
 * 서버로 내주고(WORKSHEET_START_URL), Playwright 의 Electron 지원으로 셸을 연다.
 * `--no-sandbox` 는 root 로 도는 컨테이너에서만 넘긴다(코드의 sandbox: true 는 그대로).
 *
 * 보는 것
 *   - 칸 넷(머리줄·실제 사이트·칸막이·앱)이 겹치지 않게 놓였는가
 *   - 주소 칸이 실제 사이트의 전체 주소를 보이는가
 *   - 앱(.workspace)이 그려지고, 상품 불러오기 실패 때 원래의 안내가 뜨는가
 *   - 보스 키가 칸을 접고 수치를 가리며, 다시 누르면 펴지는가
 *   - 실제 사이트 칸에 프리로드가 없고 샌드박스·격리인가, 세션이 나뉘었는가
 *   - 픽스처의 #secret-text 와 페이지 구조가 그대로인가, 픽스처 서버에 GET 말고는
 *     아무것도 오지 않았는가
 *   - 빌드한 메인 프로세스에 주입·머리글 변경 API 가 없는가
 *   - Chromium 넷 로그(--log-net-log)로 본 프로그램 전체의 요청이 픽스처와 공개 주소뿐인가
 *     (맞춤법 사전 내려받기 같은 브라우저 자체의 요청도 여기서 잡힌다)
 *   - 앱 칸이 세로로 스크롤되는가(머리줄·칸막이 CSS 가 앱 칸까지 막지 않는가)
 *   - 실제 사이트가 연 mailto:·앱 호출 주소가 shell.openExternal 로 넘어가지 않는가,
 *     클라이언트 인증서를 요구받아도 내주지 않는가
 *   - (X 화면이 있으면) tools/xinput.py 로 넣은 진짜 키·마우스 입력으로 전역 보스 키와
 *     칸막이 끌기가 동작하는가. Playwright 입력은 페이지 안으로만 들어가 이 길을 못 지난다.
 *
 * 화면 사진은 mods/desktop-shell/screenshots/ 에 남긴다. 실패가 하나라도 있으면
 * 0 이 아닌 값으로 끝난다.
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../..');
const fixture = resolve(repo, 'mods/fixtures/search-mock.html');
const shots = resolve(here, 'screenshots');
const outDir = resolve(here, 'out');
const appDir = resolve(repo, 'dist-mods/desktop-shell/app');
const PUBLIC_ORIGIN = 'https://byebye.tkddls8848.workers.dev';
const DEFAULT_START = 'https://search.naver.com/';
const extraArgs = process.argv.slice(2);

/** Playwright 는 package.json 에 넣지 않는다. NODE_PATH 나 PLAYWRIGHT_PATH 로 찾는다. */
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const name of candidates) {
    try {
      return require(name);
    } catch {
      // 다음 후보
    }
  }
  throw new Error('playwright 를 찾지 못했습니다. NODE_PATH=/opt/node22/lib/node_modules 로 돌리십시오.');
}

const { _electron: electron } = loadPlaywright();
const electronBin = createRequire(join(here, 'package.json'))('electron');

// --- 작은 시험 틀 ---------------------------------------------------------------

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL ${name}\n     ${String(error?.message ?? error).split('\n').join('\n     ')}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  기대: ${e}\n  실제: ${a}`);
}
async function until(fn, message, timeout = 10_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${message} (마지막 값: ${last instanceof Error ? last.message : JSON.stringify(last)})`);
}

/** X 화면에 진짜 입력을 넣는 도구(tools/xinput.py). 쓸 수 없으면 해당 시험은 건너뛴다. */
const xinputTool = join(here, 'tools/xinput.py');
function xinput(...args) {
  execFileSync('python3', [xinputTool, ...args.map(String)], { stdio: 'pipe' });
}
const xinputReady = (() => {
  if (process.platform !== 'linux' || !process.env.DISPLAY) return false;
  try {
    execFileSync('python3', ['-c', "import ctypes; ctypes.CDLL('libXtst.so.6'); ctypes.CDLL('libX11.so.6')"], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();
async function checkReal(name, fn) {
  if (!xinputReady) {
    results.push({ name, ok: true, skipped: true });
    console.log(`skip ${name} (X11 XTest 없음)`);
    return;
  }
  await check(name, fn);
}

// --- 픽스처 서버: 들어온 요청을 모두 적는다 -------------------------------------------

const requests = [];
const fixtureHtml = readFileSync(fixture, 'utf8');
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, length: body.length });
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'GET' && path === '/search-mock.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fixtureHtml);
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const START = `http://127.0.0.1:${port}/search-mock.html`;

const userData = mkdtempSync(join(tmpdir(), 'worksheet-desk-e2e-'));
// 넷 로그는 앱 데이터 밖에 둔다. 앱 데이터 폴더에 남는 것을 따로 견주기 때문이다.
const netDir = mkdtempSync(join(tmpdir(), 'worksheet-desk-net-'));
const netLog = join(netDir, 'net.json');
mkdirSync(shots, { recursive: true });

let app;
let exitCode = 1;
try {
  app = await electron.launch({
    executablePath: electronBin,
    args: [here, `--log-net-log=${netLog}`, ...extraArgs],
    env: { ...process.env, WORKSHEET_START_URL: START, WORKSHEET_USER_DATA: userData },
    timeout: 60_000,
  });
  app.process().stderr.on('data', (chunk) => {
    const text = String(chunk);
    if (!/Debugger|devtools|nodejs\.org|dbus|Fontconfig|GPU|gl_|viz_|ALSA/i.test(text)) process.stderr.write(`[electron] ${text}`);
  });

  // 창은 app 이 준비된 뒤 start() 에서 만들어진다. 먼저 창을 기다려야 메인 프로세스가 뜨지
  // 못했을 때도 알아볼 수 있는 실패로 끝난다.
  await until(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length === 1), '셸 창이 뜨지 않았습니다(빌드·메인 프로세스 오류 확인)', 30_000);

  // 화면 사진이 늘 같은 크기로 나오게 창 안쪽 크기를 맞춘다.
  await app.evaluate(({ BaseWindow, nativeTheme }) => {
    nativeTheme.themeSource = 'light';
    BaseWindow.getAllWindows()[0].setContentSize(1440, 900);
  });

  const pageBy = (test, label) => until(() => app.windows().find((p) => test(p.url())), `${label} 칸이 뜨지 않았습니다`, 20_000);
  const web = await pageBy((url) => url.startsWith(`http://127.0.0.1:${port}/`), '실제 사이트');
  const toolbar = await pageBy((url) => url === 'worksheet://app/toolbar.html', '머리줄');
  const pane = await pageBy((url) => url === 'worksheet://app/index.html', '앱');
  const splitter = await pageBy((url) => url === 'worksheet://app/splitter.html', '칸막이');
  for (const page of [web, toolbar, pane, splitter]) await page.waitForLoadState('load');
  await pane.waitForSelector('.workspace');

  /** 창 안의 칸들: 어떤 주소를 싣고 어디에 놓였는가. */
  const views = () => app.evaluate(({ BaseWindow }) => {
    const win = BaseWindow.getAllWindows()[0];
    return win.contentView.children.map((view) => {
      const url = view.webContents.getURL();
      const role = url.startsWith('worksheet://app/toolbar') ? 'toolbar'
        : url.startsWith('worksheet://app/splitter') ? 'splitter'
          : url.startsWith('worksheet://app/') ? 'app' : 'web';
      return { role, url, bounds: view.getBounds(), visible: view.getVisible() };
    });
  });
  const byRole = async () => Object.fromEntries((await views()).map((v) => [v.role, v]));
  /** 문서 목록에서 시트를 다시 연다. ≤700px 배치에서는 사이드바 단추가 숨어 있어 목록의 첫 문서를 누른다. */
  async function openSheet() {
    if (await pane.isVisible('.ws-document')) return;
    await pane.click('.ws-files .ws-file-link >> nth=0');
    await until(() => pane.isVisible('.ws-document'), '시트가 다시 열려야 합니다');
  }
  const press = (id) => app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu().getMenuItemById(itemId).click(), id);

  /** 칸마다 capturePage 로 찍어 창 안쪽 한 장으로 합친다. 창틀은 들어가지 않는다. */
  async function shot(name) {
    await new Promise((r) => setTimeout(r, 400));
    const b64 = await app.evaluate(async ({ BaseWindow, nativeImage }) => {
      const win = BaseWindow.getAllWindows()[0];
      const [w, h] = win.getContentSize();
      const canvas = Buffer.alloc(w * h * 4, 255);
      for (const view of win.contentView.children) {
        if (!view.getVisible()) continue;
        const b = view.getBounds();
        let image = await view.webContents.capturePage();
        const size = image.getSize();
        if (size.width !== b.width || size.height !== b.height) image = image.resize({ width: b.width, height: b.height });
        const bitmap = image.toBitmap();
        const cw = Math.min(b.width, w - b.x);
        const ch = Math.min(b.height, h - b.y);
        for (let y = 0; y < ch; y += 1) {
          bitmap.copy(canvas, ((b.y + y) * w + b.x) * 4, y * b.width * 4, (y * b.width + cw) * 4);
        }
      }
      return nativeImage.createFromBitmap(canvas, { width: w, height: h }).toPNG().toString('base64');
    });
    writeFileSync(join(shots, name), Buffer.from(b64, 'base64'));
    console.log(`     사진: screenshots/${name}`);
  }

  // 실제 사이트의 처음 구조. 마지막에 셸이 아무것도 바꾸지 않았는지 견준다.
  const fingerprint = () => web.evaluate(() => ({
    html: document.body.outerHTML,
    secret: document.getElementById('secret-text')?.outerHTML ?? null,
    scripts: document.scripts.length,
    styles: document.querySelectorAll('style, link[rel="stylesheet"]').length,
    elements: document.querySelectorAll('*').length,
  }));
  const before = await fingerprint();

  // --- 배치 -----------------------------------------------------------------

  await check('칸 넷이 겹치지 않게 놓인다(머리줄 44px, 앱 칸 400px 오른쪽)', async () => {
    const v = await byRole();
    equal(Object.keys(v).sort(), ['app', 'splitter', 'toolbar', 'web'], '칸 이름');
    equal(v.toolbar.bounds, { x: 0, y: 0, width: 1440, height: 44 }, '머리줄 자리');
    equal(v.web.bounds, { x: 0, y: 44, width: 1034, height: 856 }, '실제 사이트 자리');
    equal(v.splitter.bounds, { x: 1034, y: 44, width: 6, height: 856 }, '칸막이 자리');
    equal(v.app.bounds, { x: 1040, y: 44, width: 400, height: 856 }, '앱 칸 자리');
    assert(Object.values(v).every((x) => x.visible), '모든 칸이 보여야 합니다');
    equal(v.web.url, START, '실제 사이트 칸은 원래 주소 그대로 연다');
  });

  await check('주소 칸이 실제 사이트의 전체 주소를 보인다', async () => {
    await until(async () => (await toolbar.inputValue('#address')) === START, '주소 칸 값');
    equal(await toolbar.textContent('#url-view'), START, '겹침 글도 전체 주소');
    equal(await toolbar.textContent('.tb-url__host'), `127.0.0.1:${port}`, '호스트를 진하게');
    equal(await toolbar.getAttribute('#security', 'data-scheme'), 'http', 'http 는 보안되지 않은 연결로 표시');
  });

  await check('앱 칸에 WORKSHEET 가 그려지고 좁은 화면 배치(≤700px)가 적용된다', async () => {
    assert(await pane.isVisible('.workspace'), '.workspace 가 보여야 합니다');
    equal(await pane.evaluate(() => innerWidth), 400, '앱 칸 폭');
    equal(await pane.textContent('.ws-title-group h1'), '중장기 운영 계획', '문서 제목');
    assert(await pane.isVisible('.ws-document'), '처음에는 시트가 열려 있다');
    equal(await pane.evaluate(() => getComputedStyle(document.querySelector('.ws-sidebar')).display), 'none', '≤700px 에서는 사이드바를 접는다');
  });

  await check('보스 키가 전역 단축키로 등록되어 있다', async () => {
    assert(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Alt+Shift+K')), 'Alt+Shift+K 미등록');
    equal(await toolbar.textContent('#boss-key'), 'Alt+Shift+K', '머리줄 안내');
  });

  await shot('desk-light.png');

  await check('앱 칸은 세로로 스크롤되어 아래의 결과까지 닿는다(머리줄·칸막이 CSS 가 막지 않음)', async () => {
    // CSS 가 한 파일로 합쳐져 세 문서에 다 실린다. 머리줄의 html·body overflow:hidden 이
    // 새면 앱 칸이 856px 아래를 영영 보여 주지 못한다.
    const overflow = (page) => page.evaluate(() => [getComputedStyle(document.documentElement).overflowY, getComputedStyle(document.body).overflowY]);
    equal(await overflow(pane), ['visible', 'visible'], '앱 칸 html·body overflow');
    equal(await overflow(toolbar), ['hidden', 'hidden'], '머리줄은 스크롤하지 않는다');
    equal(await overflow(splitter), ['hidden', 'hidden'], '칸막이는 스크롤하지 않는다');
    const result = await pane.evaluate(() => document.querySelector('.doc--result').getBoundingClientRect().top);
    assert(result > 856, `결과가 첫 화면 아래에 있어야 이 시험이 뜻이 있습니다: ${result}`);
    await pane.mouse.move(200, 500);
    await pane.mouse.wheel(0, 600);
    await until(() => pane.evaluate(() => scrollY > 0), '휠로 내려가야 합니다');
    await pane.evaluate(() => document.querySelector('.doc--result').scrollIntoView({ block: 'start' }));
    await until(() => pane.evaluate(() => Math.abs(document.querySelector('.doc--result').getBoundingClientRect().top) < 80), '결과 칸까지 내려가야 합니다');
    await shot('desk-light-results.png');
    await pane.evaluate(() => scrollTo(0, 0));
    await until(() => pane.evaluate(() => scrollY === 0), '맨 위로');
  });

  const DARK_SURFACE = 'rgb(27, 30, 34)';
  const LIGHT_SURFACE = 'rgb(255, 255, 255)';
  const bodyColor = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await check('어두운 화면: 앱의 밝기 단추로 바꾸면 머리줄·칸막이도 따라간다(같은 출처 저장소)', async () => {
    await pane.click('.ws-theme');
    await until(() => pane.evaluate(() => document.documentElement.dataset.theme === 'dark'), '앱 칸 어두운 화면');
    await until(async () => (await bodyColor(toolbar)) === DARK_SURFACE, '머리줄 어두운 배경');
    await until(async () => (await bodyColor(splitter)) === DARK_SURFACE, '칸막이 어두운 배경');
    await shot('desk-dark.png');
    await pane.click('.ws-theme');
    await until(async () => (await bodyColor(toolbar)) === LIGHT_SURFACE, '머리줄 밝은 배경');
    // 고른 밝기를 지워 운영체제 설정을 따르게 되돌린다. 머리줄도 storage 이벤트로 따라온다.
    await pane.evaluate(() => { localStorage.removeItem('worksheet-theme'); delete document.documentElement.dataset.theme; });
    await until(() => toolbar.evaluate(() => !('theme' in document.documentElement.dataset)), '머리줄 고른 밝기 지움');
  });

  await check('운영체제 다크 모드(prefers-color-scheme)를 머리줄·칸막이·앱 칸이 따른다', async () => {
    // Xvfb 에서는 nativeTheme 이 렌더러에 닿지 않아 CDP 로 운영체제 설정을 흉내 낸다.
    for (const page of [toolbar, splitter, pane]) await page.emulateMedia({ colorScheme: 'dark' });
    await until(async () => (await bodyColor(toolbar)) === DARK_SURFACE, '머리줄');
    await until(async () => (await bodyColor(splitter)) === DARK_SURFACE, '칸막이');
    await until(() => pane.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ws-surface').trim() === '#1b1e22'), '앱 칸 토큰');
    for (const page of [toolbar, splitter, pane]) await page.emulateMedia({ colorScheme: 'light' });
    await until(async () => (await bodyColor(toolbar)) === LIGHT_SURFACE, '머리줄 되돌림');
  });

  // --- 보스 키 ---------------------------------------------------------------

  await check('보스 키: 앱 칸을 바로 접고 수치를 문서 목록으로 가린다', async () => {
    await press('boss-key');
    const v = await byRole();
    assert(!v.app.visible && !v.splitter.visible, '앱 칸과 칸막이가 숨어야 합니다');
    equal(v.web.bounds, { x: 0, y: 44, width: 1440, height: 856 }, '실제 사이트가 창 너비를 다 차지');
    await until(() => pane.evaluate(() => document.querySelector('.ws-document').hidden && !document.querySelector('.ws-list').hidden), '앱이 문서 목록으로 바뀌어야 합니다');
    await until(async () => (await toolbar.getAttribute('#pane', 'aria-pressed')) === 'false', '머리줄 단추 상태');
  });
  await shot('desk-collapsed.png');

  await check('보스 키를 다시 누르면 펴지고, 수치는 가려진 채(문서 목록) 돌아온다', async () => {
    await press('boss-key');
    const v = await byRole();
    assert(v.app.visible && v.splitter.visible, '앱 칸이 다시 보여야 합니다');
    equal(v.app.bounds, { x: 1040, y: 44, width: 400, height: 856 }, '앱 칸 자리 복원');
    equal(v.web.bounds.width, 1034, '실제 사이트 폭 복원');
    assert(await pane.isVisible('.ws-list'), '문서 목록이 보여야 합니다');
    assert(!(await pane.isVisible('.ws-document')), '시트는 사람이 다시 열 때까지 가려져 있어야 합니다');
  });
  await shot('desk-restored-covered.png');

  await checkReal('실제 키 입력(X11)으로 누른 Alt+Shift+K 가 운영체제 전역에서 접고 다시 편다', async () => {
    await openSheet();
    await web.click('body');
    const size = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getContentSize());
    xinput('keys', 'Alt_L', 'Shift_L', 'k');
    await until(async () => !(await byRole()).app.visible, '진짜 보스 키로 접힘');
    await until(() => pane.evaluate(() => !document.querySelector('.ws-list').hidden), '수치 가림');
    xinput('keys', 'Alt_L', 'Shift_L', 'k');
    await until(async () => (await byRole()).app.visible, '진짜 보스 키로 다시 폄');
    // Alt 를 눌러도 숨긴 메뉴 줄이 튀어나와 칸 배치를 밀지 않아야 한다.
    equal(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getContentSize()), size, '창 안쪽 크기');
  });

  await check('머리줄 단추로 접어 둔 칸은 보스 키가 펴지 않는다(가리기만 한다)', async () => {
    await openSheet();
    await toolbar.click('#pane');
    await until(async () => !(await byRole()).app.visible, '단추로 접힘');
    await press('boss-key');
    assert(!(await byRole()).app.visible, '보스 키가 숨긴 칸을 끄집어내면 안 됩니다');
    await until(() => pane.evaluate(() => !document.querySelector('.ws-list').hidden), '접힌 채로도 수치는 가려진다');
    await press('boss-key');
    assert((await byRole()).app.visible, '두 번째 보스 키는 편다');
    await openSheet();
  });

  await check('창을 내리거나(minimize) 숨기면(hide) 수치를 가린다', async () => {
    // Xvfb 에는 창 관리자가 없어 실제로 내려가지 않는다. 같은 이벤트를 내보내 연결을 본다.
    for (const event of ['minimize', 'hide']) {
      await openSheet();
      await app.evaluate(({ BaseWindow }, name) => BaseWindow.getAllWindows()[0].emit(name), event);
      await until(() => pane.isVisible('.ws-list'), `${event} 뒤 문서 목록`);
      assert((await byRole()).app.visible, '칸은 그대로 둔다');
    }
    await openSheet();
  });

  await check('Esc 는 앱 칸 안에서 원래대로 문서 목록으로 바꾼다', async () => {
    await openSheet();
    await pane.keyboard.press('Escape');
    await until(() => pane.isVisible('.ws-list'), 'Esc 뒤 문서 목록');
    await openSheet();
  });

  // --- 칸막이 ----------------------------------------------------------------

  await check('칸막이: 끌면 폭이 바뀌고, 키보드로도 옮기며, 두 번 누르면 400px 로 돌아온다', async () => {
    // 자동화 입력의 screenX 는 칸 기준이라 칸막이가 움직이면 되먹임이 생긴다(실제
    // 마우스는 화면 기준이라 생기지 않는다). 그래서 한 번에 옮긴다.
    await splitter.mouse.move(3, 300);
    await splitter.mouse.down();
    await splitter.mouse.move(-337, 300);
    await splitter.mouse.up();
    const dragged = await until(async () => {
      const width = (await byRole()).app.bounds.width;
      return width > 450 ? width : false;
    }, '끈 만큼 넓어져야 합니다');
    assert(dragged >= 720 && dragged <= 760, `끈 거리(340px)와 맞지 않습니다: ${dragged}`);
    const v = await byRole();
    equal(v.web.bounds.width + 6 + v.app.bounds.width, 1440, '세 칸의 합');
    // 700px 를 넘기면 앱이 사이드바가 있는 넓은 배치로 바뀐다.
    await until(() => pane.evaluate(() => getComputedStyle(document.querySelector('.ws-sidebar')).display !== 'none'), '넓은 배치');
    await shot('desk-wide-pane.png');
    await splitter.dblclick('#split');
    await until(async () => (await byRole()).app.bounds.width === 400, '두 번 누르면 기본 폭');
    await splitter.focus('#split');
    await splitter.keyboard.press('ArrowLeft');
    await until(async () => (await byRole()).app.bounds.width === 416, '← 키는 16px 넓힌다');
    await splitter.keyboard.press('Home');
    await until(async () => (await byRole()).app.bounds.width === 400, 'Home 은 기본 폭');
  });

  await checkReal('실제 마우스(X11)로 칸막이를 끈다: 칸 밖으로 크게 벗어나도 끌기가 이어진다', async () => {
    const bounds = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getContentBounds());
    const y = bounds.y + 400;
    const grip = async () => bounds.x + (await byRole()).splitter.bounds.x + 3;
    // 천천히 왼쪽으로 300px: 앱 칸이 700px 가 된다.
    let x = await grip();
    xinput('drag', x, y, x - 300, 12);
    await until(async () => (await byRole()).app.bounds.width === 700, '천천히 끈 폭');
    // 빠르게 오른쪽으로 250px(한 번에 약 80px 씩, 6px 칸을 크게 벗어난다).
    x = await grip();
    xinput('drag', x, y, x + 250, 3);
    await until(async () => (await byRole()).app.bounds.width === 450, '빠르게 끈 폭');
    await splitter.dblclick('#split');
    await until(async () => (await byRole()).app.bounds.width === 400, '기본 폭');
  });

  await check('창을 줄여도 실제 사이트는 360px, 앱 칸은 320px 아래로 줄지 않는다', async () => {
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setContentSize(800, 700));
    await until(async () => {
      const v = await byRole();
      return v.web.bounds.width >= 360 && v.app.bounds.width >= 320 && v.web.bounds.width + 6 + v.app.bounds.width === 800;
    }, '좁은 창 배치');
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setContentSize(1440, 900));
    await until(async () => (await byRole()).app.bounds.width === 400, '원래 크기');
  });

  // --- 앱 동작 ---------------------------------------------------------------

  await check('상품 불러오기: 공개 주소에 닿지 못하면 원래의 실패 안내를 띄운다(멈추지 않음)', async () => {
    await openSheet();
    await pane.click('.ws-document__tab:nth-of-type(2)');
    await pane.click('.products__load');
    const text = await until(async () => {
      const node = await pane.$('.products__message--bad');
      return node ? node.textContent() : false;
    }, '실패 안내', 40_000);
    assert(/불러오지 못했습니다/.test(text), `안내 문구: ${text}`);
    assert(await pane.isVisible('.workspace'), '화면은 그대로');
    await pane.click('.ws-document__tab:nth-of-type(1)');
  });

  await check('공유 링크 복사: 우리 출처에만 허락한 클립보드 쓰기가 되고, 주소는 공개 주소를 가리킨다', async () => {
    await app.evaluate(({ clipboard }) => clipboard.writeText('BEFORE'));
    await pane.click('.ws-sharing > summary');
    await pane.click('.share__copy');
    await until(async () => (await pane.textContent('.share__state')) === '링크를 복사했습니다.', '복사 안내');
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert(copied.startsWith(`${PUBLIC_ORIGIN}/?`), `복사한 주소: ${copied}`);
    equal(copied, await pane.inputValue('.share__link'), '칸에 보인 주소와 같다');
    await pane.click('.ws-sharing > summary');
    await pane.evaluate(() => scrollTo(0, 0));
  });

  await check('앱 칸의 CSP 가 공개 주소 밖으로의 연결을 막는다', async () => {
    const before = requests.length;
    const outcome = await pane.evaluate(async (url) => {
      try { await fetch(url); return 'reached'; } catch { return 'blocked'; }
    }, START);
    equal(outcome, 'blocked', '앱 칸에서 다른 출처로 fetch');
    equal(requests.length, before, '픽스처 서버에 요청이 와서는 안 됩니다');
    const csp = await pane.evaluate(async () => (await fetch('/index.html')).headers.get('content-security-policy'));
    assert(/connect-src 'self'/.test(csp) && /script-src 'self'/.test(csp) && /default-src 'none'/.test(csp), `CSP: ${csp}`);
  });

  // --- 실제 사이트 칸의 빗장 ----------------------------------------------------

  await check('실제 사이트 칸: 프리로드 없음, 샌드박스·격리, Node 없음, 세션 분리', async () => {
    const info = await app.evaluate(({ webContents, session }) => webContents.getAllWebContents().map((contents) => {
      const prefs = contents.getLastWebPreferences();
      return {
        url: contents.getURL(),
        preload: contents._getPreloadScript?.() ?? null,
        sandbox: prefs.sandbox,
        contextIsolation: prefs.contextIsolation,
        nodeIntegration: prefs.nodeIntegration,
        nodeIntegrationInSubFrames: prefs.nodeIntegrationInSubFrames,
        webSecurity: prefs.webSecurity,
        allowRunningInsecureContent: prefs.allowRunningInsecureContent,
        webSession: contents.session === session.fromPartition('persist:web'),
        appSession: contents.session === session.fromPartition('persist:worksheet'),
        sessionPreloads: contents.session.getPreloadScripts().length,
      };
    }));
    const webInfo = info.find((x) => x.url.startsWith('http://127.0.0.1'));
    assert(webInfo, '실제 사이트 칸을 찾지 못했습니다');
    equal(webInfo.preload, null, '실제 사이트 칸 프리로드');
    equal([webInfo.sandbox, webInfo.contextIsolation, webInfo.nodeIntegration, webInfo.nodeIntegrationInSubFrames], [true, true, false, false], '샌드박스·격리·Node');
    equal([webInfo.webSecurity, webInfo.allowRunningInsecureContent], [true, false], '웹 보안');
    equal([webInfo.webSession, webInfo.appSession, webInfo.sessionPreloads], [true, false, 0], '세션');
    for (const ours of info.filter((x) => x.url.startsWith('worksheet://'))) {
      equal([ours.sandbox, ours.contextIsolation, ours.nodeIntegration, ours.appSession], [true, true, false, true], `${ours.url} 설정`);
      assert(ours.preload, `${ours.url} 에는 우리 프리로드가 있다`);
    }
    const page = await web.evaluate(() => ({
      require: typeof require, process: typeof process, desk: typeof window.worksheetDesk, chrome: typeof window.worksheetDeskChrome,
    }));
    equal(page, { require: 'undefined', process: 'undefined', desk: 'undefined', chrome: 'undefined' }, '페이지에서 보이는 것');
    const handled = await app.evaluate(({ session }) => [
      session.fromPartition('persist:web').protocol.isProtocolHandled('worksheet'),
      session.fromPartition('persist:worksheet').protocol.isProtocolHandled('worksheet'),
    ]);
    equal(handled, [false, true], 'worksheet:// 는 우리 세션에만 달린다');
  });

  await check('실제 사이트 칸: 권한 요청은 모두 거절된다', async () => {
    const states = await web.evaluate(async () => ({
      notification: await Notification.requestPermission(),
      geolocation: (await navigator.permissions.query({ name: 'geolocation' })).state,
      camera: (await navigator.permissions.query({ name: 'camera' })).state,
      // 우리 공유 링크가 클립보드에 있어도 실제 사이트는 읽지 못한다.
      clipboardRead: (await navigator.permissions.query({ name: 'clipboard-read' })).state,
      clipboardWrite: (await navigator.permissions.query({ name: 'clipboard-write' })).state,
    }));
    equal(states, { notification: 'denied', geolocation: 'denied', camera: 'denied', clipboardRead: 'denied', clipboardWrite: 'denied' }, '권한 상태');
  });

  await check('사이트가 클라이언트 인증서를 요구해도 내주지 않는다(Electron 기본값은 첫 인증서를 묻지 않고 보낸다)', async () => {
    // 인증서를 요구하는 TLS 서버 대신, 등록된 처리기에 같은 모양의 이벤트를 흘려 본다.
    const outcome = await app.evaluate(({ app: electronApp }) => {
      let prevented = false;
      const picked = [];
      const event = { preventDefault: () => { prevented = true; } };
      const fakeCert = { subjectName: 'CN=someone', issuerName: 'CN=ca' };
      electronApp.emit('select-client-certificate', event, null, 'https://example.com/', [fakeCert], (...args) => picked.push(args));
      return { prevented, picked };
    });
    // Electron 도 이 이벤트에 제 처리기를 하나 달아 두므로 처리기 수는 보지 않는다. 답이 한 번,
    // 인증서 없이 갔는지만 본다(기본 동작이 살아 있으면 가짜 인증서가 골라진다).
    equal(outcome, { prevented: true, picked: [[]] }, '기본 동작을 막고 인증서 없이 답한다');
  });

  // 여기까지 셸이 실제 사이트 페이지를 건드리지 않았는지 본다(아래부터는 이동 시험).
  await check('픽스처의 #secret-text 와 페이지 구조가 그대로다(셸이 건드리지 않음)', async () => {
    const after = await fingerprint();
    equal(after.secret, '<div class="item private" id="secret-text">이 문단은 확장이 읽으면 안 되는 페이지 내용입니다: SECRET-PAGE-TEXT</div>', '#secret-text 원문');
    equal(after, before, '처음과 같은 DOM');
    equal([after.scripts, after.styles], [0, 1], '스크립트·스타일이 끼어들지 않음');
  });

  await check('픽스처 서버에는 페이지 GET 말고 아무것도 오지 않았다', async () => {
    const strange = requests.filter((r) => r.method !== 'GET' || !['/search-mock.html', '/favicon.ico'].includes(new URL(r.url, 'http://x').pathname) || r.length > 0);
    equal(strange, [], '예상 밖 요청');
    assert(requests.some((r) => r.url === '/search-mock.html'), '페이지를 연 GET 이 있어야 합니다');
  });

  // --- 이동 -------------------------------------------------------------------

  await check('주소 칸으로 이동하고, 뒤로 가면 주소 칸도 따라온다', async () => {
    const next = `${START}?q=2`;
    await toolbar.fill('#address', next);
    await toolbar.press('#address', 'Enter');
    await until(async () => (await toolbar.inputValue('#address')) === next, '이동한 주소');
    await until(async () => (await byRole()).web.url === next, '실제 사이트 칸 주소');
    await until(() => toolbar.isEnabled('#back'), '뒤로 단추 활성');
    await toolbar.click('#back');
    await until(async () => (await toolbar.inputValue('#address')) === START, '뒤로 간 주소');
  });

  await check('메뉴 단축키: 주소 칸으로(Ctrl+L), 뒤로·앞으로(Alt+←/→)', async () => {
    await press('focus-address');
    await until(() => toolbar.evaluate(() => document.activeElement?.id === 'address'), '주소 칸에 초점');
    await toolbar.press('#address', 'Escape');
    await press('forward');
    await until(async () => (await byRole()).web.url === `${START}?q=2`, '앞으로');
    await press('back');
    await until(async () => (await byRole()).web.url === START, '뒤로');
  });

  await check('주소 칸: http(s) 가 아니거나 검색어 같은 글은 받지 않는다', async () => {
    for (const input of ['javascript:alert(1)', '은퇴 자금 계산']) {
      await toolbar.fill('#address', input);
      await toolbar.press('#address', 'Enter');
      await until(async () => (await toolbar.getAttribute('#address', 'aria-invalid')) === 'true', `${input} 거절 표시`);
      equal((await byRole()).web.url, START, `${input} 로 이동하면 안 됩니다`);
    }
    await toolbar.press('#address', 'Escape');
    equal(await toolbar.inputValue('#address'), START, 'Esc 는 실제 주소로 되돌린다');
    await web.click('body');
    equal(await toolbar.inputValue('#address'), START, '칸을 떠나도 실제 주소');
  });

  await check('실제 사이트의 새 창(window.open)은 숨은 창 없이 같은 칸에서 열린다', async () => {
    const popup = `${START}?popup=1`;
    await web.evaluate((url) => { window.open(url, '_blank'); }, popup);
    await until(async () => (await byRole()).web.url === popup, '같은 칸에서 열림');
    const counts = await app.evaluate(({ BaseWindow, BrowserWindow, webContents }) => [
      BaseWindow.getAllWindows().length, BrowserWindow.getAllWindows().length, webContents.getAllWebContents().length,
    ]);
    equal(counts, [1, 0, 4], '창·콘텐츠 수');
    await until(async () => (await toolbar.inputValue('#address')) === popup, '주소 칸도 따라옴');
  });

  await check('실제 사이트가 무엇을 열려 해도 운영체제의 다른 프로그램에는 넘기지 않는다(mailto: 포함)', async () => {
    // shell.openExternal 을 엿보는 것으로 바꿔 두고, 새 창과 링크 누르기 두 길을 다 시험한다.
    await app.evaluate(({ shell }) => {
      globalThis.__opened = [];
      shell.openExternal = async (url) => { globalThis.__opened.push(url); };
    });
    const current = (await byRole()).web.url;
    for (const target of ['mailto:someone@example.com?subject=x', 'ms-settings:privacy', 'vscode://file/etc/hostname']) {
      await web.evaluate((url) => { window.open(url); }, target);
      // 링크는 evaluate 로 누른다. 막힌 이동은 끝나지 않아 Playwright 의 click 이 기다리다 멈춘다.
      await web.evaluate((url) => {
        const link = Object.assign(document.createElement('a'), { href: url, textContent: 'x' });
        document.body.append(link);
        link.click();
        link.remove();
      }, target);
    }
    await new Promise((r) => setTimeout(r, 600));
    equal(await app.evaluate(() => globalThis.__opened), [], 'openExternal 로 넘어간 주소');
    equal((await byRole()).web.url, current, '실제 사이트 칸은 그 자리에 있다');
  });

  await check('실제 사이트가 http(s) 밖(worksheet:, file:)으로 가려 하면 막는다', async () => {
    const current = (await byRole()).web.url;
    for (const target of ['worksheet://app/index.html', 'file:///etc/hostname']) {
      await web.evaluate((url) => { location.href = url; }, target).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 400));
      equal((await byRole()).web.url, current, `${target} 로 가면 안 됩니다`);
    }
  });

  // --- 빌드 결과 정적 점검 ---------------------------------------------------------

  await check('메인·프리로드에 주입·머리글 변경·페이지 읽기 API 가 없다', async () => {
    const forbidden = [
      'executeJavaScript', 'insertCSS', 'webRequest', 'onHeadersReceived', 'onBeforeSendHeaders',
      'setUserAgent', 'debugger.attach', 'secret-text', 'registerPreloadScript', 'setPreloads',
      'certificate-error', 'X-Frame-Options', 'content-security-policy-report', 'openExternal',
    ];
    for (const file of readdirSync(outDir).filter((f) => f.endsWith('.js'))) {
      const code = readFileSync(join(outDir, file), 'utf8');
      for (const word of forbidden) assert(!code.includes(word), `${file} 에 ${word} 가 있습니다`);
      const urls = new Set(code.match(/https?:\/\/[a-z0-9.-]+/gi) ?? []);
      for (const url of urls) {
        assert([PUBLIC_ORIGIN, DEFAULT_START.replace(/\/$/, '')].includes(url), `${file} 의 바깥 주소: ${url}`);
      }
    }
  });

  await check('우리 화면 파일에 원격 주소가 없다', async () => {
    for (const file of readdirSync(join(appDir, 'assets'))) {
      const code = readFileSync(join(appDir, 'assets', file), 'utf8');
      const urls = [...new Set(code.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])]
        .filter((url) => url !== PUBLIC_ORIGIN && !url.startsWith('http://www.w3.org'));
      equal(urls, [], `${file} 의 원격 주소`);
    }
  });

  await app.close();
  app = null;

  await check('넷 로그: 프로그램 전체가 연 주소는 픽스처와 공개 주소뿐이다(맞춤법 사전 등 없음)', async () => {
    // 브라우저 자체가 내는 요청(맞춤법 사전·구성 요소 갱신 등)까지 Chromium 넷 로그로 본다.
    // 프록시를 거치면 소켓 주소는 프록시이므로 요청 주소(params.url)의 출처로 견준다.
    const log = JSON.parse(readFileSync(netLog, 'utf8'));
    const origins = new Set();
    for (const event of log.events) {
      const url = event.params?.url;
      if (typeof url === 'string' && /^(https?|wss?|ftp):/i.test(url)) origins.add(new URL(url).origin);
    }
    equal([...origins].sort(), [new URL(START).origin, PUBLIC_ORIGIN].sort(), '요청한 출처');
  });

  await check('앱 데이터에 남는 것은 칸 배치뿐이다(주소·방문 기록 없음)', async () => {
    const saved = JSON.parse(readFileSync(join(userData, 'desk-layout.json'), 'utf8'));
    equal(Object.keys(saved).sort(), ['bounds', 'paneVisible', 'paneWidth'], '저장 항목');
    const text = JSON.stringify(saved);
    assert(!text.includes('127.0.0.1') && !text.includes('http'), `주소가 남았습니다: ${text}`);
  });

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped).length;
  const passed = results.length - failed.length - skipped;
  console.log(`\n${passed}/${results.length} 통과${skipped ? `, 건너뜀 ${skipped}` : ''}${failed.length ? `, 실패 ${failed.length}` : ''}`);
  exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error('시험을 끝까지 돌리지 못했습니다:', error);
  exitCode = 1;
} finally {
  if (app) await app.close().catch(() => undefined);
  server.close();
  rmSync(userData, { recursive: true, force: true });
  rmSync(netDir, { recursive: true, force: true });
}
process.exit(exitCode);
