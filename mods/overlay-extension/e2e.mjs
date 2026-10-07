/**
 * 사이드 시트 확장의 끝-끝 시험.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules \
 *     xvfb-run -a -s "-screen 0 1440x900x24" node mods/overlay-extension/e2e.mjs
 *
 * 빌드는 하지 않는다(두 변종이 미리 빌드되어 있다고 본다). 통과하면 0, 하나라도
 * 어긋나면 0 이 아닌 값으로 끝난다. 실제 창을 띄워야 옆 칸과 미니 창이 화면에 그려지므로
 * Xvfb(가상 화면) 안에서 돌리는 것이 좋다. 화면이 없으면 headless 로 돌고, 그때는
 * 합성 그림(진짜 페이지 + 옆 칸)을 건너뛴다 — 예전에 담아 둔 합성 그림은 지우지 않는다.
 *
 * 컨테이너는 포털·배포 주소에 닿지 못한다. 그래서 가짜 검색 결과 페이지를 로컬에
 * 띄워 쓰고, 예적금 공시는 실패하는 것이 정상이다 — 앱이 터지지 않고 오류 문구를
 * 보여 주는지 본다.
 *
 * 5 절은 Playwright 를 쓰지 않고 크로미움을 직접 띄워 CDP 로 조종한다. Playwright 는
 * 새로 생기는 창마다 "디버거 대기"로 멈춰 세우는데, 옆 칸이 연 PiP 창은 옆 칸과 같은
 * 렌더러라 옆 칸까지 함께 멈춘다. 그러면 실제 옆 칸의 미니 창 단추를 시험할 수 없다.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); }
}
const { chromium } = loadPlaywright();

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const DIST = resolve(repo, 'dist-mods/overlay-extension');
const WHALE_DIST = resolve(repo, 'dist-mods/overlay-extension-whale');
const FIXTURE = resolve(repo, 'mods/fixtures/search-mock.html');
const SHOTS = resolve(here, 'screenshots');
// 공개 주소 하나로 묶인 host_permissions 를 확인하는 데 쓴다.
const EXPECTED_HOST = JSON.parse(readFileSync(resolve(DIST, 'manifest.json'), 'utf8')).host_permissions[0];
const PUBLIC = EXPECTED_HOST.replace('/*', '');

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 디스플레이가 있으면 headed(진짜 창)로, 없으면 headless 로. */
const DISPLAY = !!process.env.DISPLAY;
/** 합성 그림을 담을 브라우저 창 자리(Xvfb 화면 크기와 같다). */
const WINDOW = { left: 0, top: 0, width: 1440, height: 900 };
/**
 * 그림에 시험용 안내 띠("자동화 도구가 조종 중", "--no-sandbox 경고")가 끼지 않게 한다.
 * 창 크기는 --window-size 로 주지 않는다. 그 스위치가 있으면 크로미움이 PiP 창에도
 * 같은 크기를 적용해 요청한 380×640 을 무시한다(실측). 대신 띄운 뒤 창 크기를 바꾼다.
 */
const QUIET_ARGS = ['--test-type'];

/** 가짜 포털 페이지를 띄우고, 이 서버가 받은 요청을 모두 적어 둔다. */
async function serveFixture() {
  const html = await readFile(FIXTURE);
  const requests = [];
  const server = createServer((q, r) => {
    requests.push(q.url);
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    r.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port, requests };
}

async function launch(dir) {
  const udd = await mkdtemp(resolve(tmpdir(), 'ws-e2e-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    channel: 'chromium',
    headless: !DISPLAY,
    // 화면 크기를 흉내 내지 않는다. 흉내 내면 Playwright 가 PiP 창에도 같은 크기를 씌운다(실측).
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [...QUIET_ARGS, `--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  // 서비스 워커가 리스너·전역 고리를 붙이고 chrome.* 가 준비될 때까지 기다린다.
  for (let i = 0; i < 60; i++) {
    if (await sw.evaluate(() => typeof self.worksheetBossKey === 'function' && !!chrome.windows)) break;
    await sleep(100);
  }
  if (DISPLAY) {
    await sw.evaluate((b) => chrome.windows.getAll().then((ws) => Promise.all(ws.map((w) => chrome.windows.update(w.id, b)))), WINDOW);
  }
  return { ctx, sw, udd, id: new URL(sw.url()).host };
}

/** 확장 페이지의 클릭(사용자 제스처)으로 chrome.sidePanel.open 을 부른다. 도구 막대 단추가 하는 일과 같다. */
async function openSidePanel(ctx, id, pageTab) {
  const opener = await ctx.newPage();
  await opener.goto(`chrome-extension://${id}/options.html`);
  await opener.evaluate(() => {
    const b = document.createElement('button');
    b.id = '__open';
    b.onclick = async () => {
      const w = await chrome.windows.getCurrent();
      chrome.sidePanel.open({ windowId: w.id }).then(() => (b.dataset.r = 'ok'), (e) => (b.dataset.r = 'err ' + e.message));
    };
    document.body.append(b);
  });
  await opener.click('#__open');
  await opener.waitForTimeout(800);
  const result = await opener.getAttribute('#__open', 'data-r');
  await pageTab.bringToFront();
  await opener.close();
  await pageTab.waitForTimeout(1200);
  return result;
}

/** 옆 칸 페이지(chrome-extension://…/sidepanel.html)를 CDP 로 붙잡아 조종한다. 그 칸이 보내는 신호(이벤트)도 모은다. */
async function attachPanel(ctx, anchor) {
  const cdp = await ctx.newCDPSession(anchor);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const panel = targetInfos.find((t) => t.type === 'page' && t.url.endsWith('/sidepanel.html'));
  if (!panel) return null;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: panel.targetId, flatten: false });
  let n = 0;
  const pending = new Map();
  const events = [];
  cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
    const m = JSON.parse(message);
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++n;
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: method }); } }, 6000);
    pending.set(i, res);
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: i, method, params }) });
  });
  const ev = async (expression, extra = {}) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...extra });
    if (r.timeout) throw new Error(`evaluate timed out: ${expression.slice(0, 40)}`);
    return r.result?.result?.value;
  };
  return { send, ev, events, detach: () => cdp.detach().catch(() => {}) };
}

function shootScreen(file) {
  execFileSync('import', ['-window', 'root', resolve(SHOTS, file)]);
}

/**
 * 합성 그림 위에 따로 뜬 창의 자리를 덧그린다.
 *
 * Xvfb 에는 창 관리자가 없어 팝업 창에 테두리·제목 줄이 없다. 그대로 두면 미니 창이
 * 포털 페이지 안에 끼워 넣은 것처럼 보여 오해를 산다. 실제 창 자리(chrome.windows 값)에
 * 선을 긋고 "별개의 창"이라고 적는다. 그리는 데 실패해도 시험은 계속한다.
 */
function markWindow(file, b, label) {
  const font = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
  const right = b.left + b.width;
  const bottom = b.top + b.height;
  const boxLeft = Math.max(0, right - 520);
  try {
    execFileSync('convert', [
      resolve(SHOTS, file),
      '-fill', 'none', '-stroke', '#e8590c', '-strokewidth', '4',
      '-draw', `rectangle ${b.left - 2},${b.top - 2} ${right + 1},${bottom + 1}`,
      '-stroke', 'none', '-fill', '#e8590c',
      '-draw', `rectangle ${boxLeft},${bottom + 8} ${right + 1},${bottom + 40}`,
      ...(existsSync(font) ? ['-font', font] : []),
      '-pointsize', '17', '-fill', 'white',
      '-annotate', `+${boxLeft + 12}+${bottom + 31}`, label,
      resolve(SHOTS, file),
    ]);
  } catch (error) {
    console.log(`     (덧그림 실패: ${error.message.split('\n')[0]})`);
  }
}

const panelCovered = `(() => {
  const doc = document.querySelector('.ws-document');
  const list = document.querySelector('.ws-list');
  return !!doc && !!list && doc.hidden === true && list.hidden === false;
})()`;

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

async function run() {
  // 예전 그림은 덮어쓴다. 통째로 지우지 않는다 — 화면 없이 돌릴 때 합성 그림이 사라지지 않게.
  await mkdir(SHOTS, { recursive: true });
  console.log(`display: ${DISPLAY ? 'on (headed)' : 'off (headless)'} · host: ${EXPECTED_HOST}`);

  // --- 1. 설명서(두 변종) -------------------------------------------------
  section('1. 설명서 / 권한 (최소 권한·가드레일)');
  const chrome = JSON.parse(await readFile(resolve(DIST, 'manifest.json'), 'utf8'));
  const whale = existsSync(resolve(WHALE_DIST, 'manifest.json'))
    ? JSON.parse(await readFile(resolve(WHALE_DIST, 'manifest.json'), 'utf8'))
    : null;

  check('content_scripts 가 없다', !('content_scripts' in chrome), JSON.stringify(chrome.content_scripts));
  check('permissions 는 sidePanel·storage 뿐', JSON.stringify([...chrome.permissions].sort()) === JSON.stringify(['sidePanel', 'storage']), JSON.stringify(chrome.permissions));
  check('tabs·activeTab·scripting·cookies·history 권한이 없다', !chrome.permissions.some((p) => ['tabs', 'activeTab', 'scripting', 'cookies', 'history'].includes(p)));
  check('optional 권한도 없다', !('optional_permissions' in chrome) && !('optional_host_permissions' in chrome));
  check('host_permissions 는 공개 주소 하나뿐', chrome.host_permissions.length === 1 && /^https:\/\/[^/*]+\/\*$/.test(chrome.host_permissions[0]), JSON.stringify(chrome.host_permissions));
  check('<all_urls> 를 쓰지 않는다', !JSON.stringify(chrome).includes('<all_urls>'));
  const csp = chrome.content_security_policy?.extension_pages ?? '';
  check('CSP: connect-src 가 자기 자신과 공개 주소뿐', new RegExp(`connect-src 'self' ${PUBLIC.replace(/[.]/g, '\\.')}(;|$)`).test(csp), csp);
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
  check("CSP: script-src 'self' 뿐(원격 코드·eval 없음)", scriptSrc === "script-src 'self'", csp);
  check("CSP: frame-src 'self'(남의 페이지를 틀에 넣지 못함)", /frame-src 'self'(;|$)/.test(csp), csp);
  check("CSP: default-src 'self'(그림·글꼴·스타일도 밖에서 싣지 않음)", /(^|; )default-src 'self'(;|$)/.test(csp), csp);
  check('declarativeNetRequest·webRequest 권한이 없다', !chrome.permissions.some((p) => p.includes('Request') || p.includes('webRequest')) && !('declarative_net_request' in chrome));
  check('web_accessible_resources·externally_connectable 이 없다(남의 페이지가 확장 화면을 끼우거나 말 걸 수 없음)', !('web_accessible_resources' in chrome) && !('externally_connectable' in chrome));
  check('이름·설명에 네이버/NAVER 가 없다', !/네이버|naver/i.test(JSON.stringify({ name: chrome.name, short: chrome.short_name, desc: chrome.description, action: chrome.action })));
  check('크롬: side_panel.default_path = sidepanel.html', chrome.side_panel?.default_path === 'sidepanel.html');
  check('크롬: boss-key 단축키 Alt+Shift+K 제안', chrome.commands['boss-key']?.suggested_key?.default === 'Alt+Shift+K');

  if (whale) {
    check('웨일: sidebar_action.default_page = sidepanel.html', whale.sidebar_action?.default_page === 'sidepanel.html');
    check('웨일: sidebar_action 에 제목·아이콘이 있다', !!whale.sidebar_action?.default_title && !!whale.sidebar_action?.default_icon);
    check('웨일: side_panel 키가 없다(충돌 방지)', !('side_panel' in whale));
    check('웨일: permissions 는 storage 뿐', JSON.stringify(whale.permissions) === JSON.stringify(['storage']), JSON.stringify(whale.permissions));
    check('웨일: action 단추가 없다(사이드바 아이콘을 쓴다)', !('action' in whale));
    check('웨일: content_scripts·web_accessible_resources 가 없다', !('content_scripts' in whale) && !('web_accessible_resources' in whale));
    check('웨일: host_permissions·CSP 가 크롬판과 같다', JSON.stringify(whale.host_permissions) === JSON.stringify(chrome.host_permissions) && whale.content_security_policy?.extension_pages === csp);
    check('웨일: 이름·설명에 네이버/NAVER 가 없다', !/네이버|naver/i.test(JSON.stringify({ name: whale.name, short: whale.short_name, desc: whale.description, side: whale.sidebar_action })));
  } else {
    check('웨일 빌드가 있다', false, `${WHALE_DIST} 없음 — --mode whale 로 빌드하라`);
  }

  // --- 2. 빌드 결과물 정적 검사 --------------------------------------------
  section('2. 빌드 결과물 (원격 코드·외부 주소·금지 API·상표)');
  for (const [label, dir] of [['크롬', DIST], ['웨일', WHALE_DIST]]) {
    if (!existsSync(dir)) continue;
    const texts = (await listFiles(dir)).filter((f) => ['.js', '.html', '.css', '.json'].includes(extname(f)));
    const all = await Promise.all(texts.map(async (f) => [f, await readFile(f, 'utf8')]));
    const urls = new Set(all.flatMap(([, s]) => s.match(/https?:\/\/[A-Za-z0-9.-]+(:\d+)?/g) ?? []));
    const allowed = new Set([PUBLIC, 'http://www.w3.org']); // SVG 이름공간은 주소가 아니라 이름표다
    check(`${label}: 결과물 속 외부 주소는 공개 주소(와 SVG 이름공간)뿐`, [...urls].every((u) => allowed.has(u)), JSON.stringify([...urls]));
    const forbidden = /document\.cookie|\beval\(|new Function\(|importScripts|XMLHttpRequest|WebSocket|sendBeacon|chrome\.(scripting|cookies|history|webRequest|declarativeNetRequest)|executeScript|insertCSS/;
    const hits = all.filter(([, s]) => forbidden.test(s)).map(([f, s]) => `${f.slice(dir.length)}: ${s.match(forbidden)[0]}`);
    check(`${label}: 쿠키·eval·원격 스크립트·요청 가로채기 API 를 쓰지 않는다`, hits.length === 0, hits.join(', '));
    const scripts = all.filter(([f]) => f.endsWith('.html')).flatMap(([, s]) => [...s.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]));
    check(`${label}: 페이지가 싣는 스크립트는 모두 확장 안의 파일`, scripts.length > 0 && scripts.every((s) => s.startsWith('./')), JSON.stringify(scripts));
    const naver = all.filter(([, s]) => /네이버|naver/i.test(s)).map(([f]) => f.slice(dir.length));
    check(`${label}: 화면·코드 어디에도 네이버/NAVER 글자가 없다`, naver.length === 0, naver.join(', '));
  }

  // --- 3. 실제 브라우저에서 ------------------------------------------------
  section('3. 실행 (가짜 포털 페이지 + 실제 옆 칸)');
  const { server, port, requests } = await serveFixture();
  const { ctx, sw, udd, id } = await launch(DIST);
  try {
    // 3a. 서비스 워커가 옆 칸 동작을 등록했는가
    const behavior = await sw.evaluate(() => chrome.sidePanel.getPanelBehavior());
    check('setPanelBehavior({openPanelOnActionClick:true}) 등록됨', behavior?.openPanelOnActionClick === true, JSON.stringify(behavior));
    const options = await sw.evaluate(() => chrome.sidePanel.getOptions({}));
    check('setOptions path = sidepanel.html', options?.path === 'sidepanel.html', JSON.stringify(options));

    // 3b. 가짜 포털 페이지를 연다. 이 페이지의 DOM 은 시험이 끝날 때까지 손대지 않는다.
    const pageTab = ctx.pages()[0] ?? (await ctx.newPage());
    await pageTab.goto(`http://127.0.0.1:${port}/`);
    const before = await pageTab.evaluate(() => document.body.innerHTML);
    const secretBefore = await pageTab.evaluate(() => document.getElementById('secret-text')?.textContent ?? '');

    // 3c. 업무 탭 주소 검사를 설정 화면 UI 로 직접 확인한다(실제 사용 경로).
    const opener = await ctx.newPage();
    await opener.goto(`chrome-extension://${id}/options.html`);
    async function trySave(value) {
      await opener.fill('#decoy', value);
      await opener.click('#decoy-form button[type="submit"]');
      await opener.waitForTimeout(80);
      const tone = await opener.getAttribute('#decoy-status', 'data-tone');
      const stored = await opener.evaluate(() => chrome.storage.local.get('decoyUrl').then((s) => s.decoyUrl ?? null));
      return { tone, stored };
    }
    check('설정: https 주소 저장됨', (await trySave('https://example.com/work')).stored === 'https://example.com/work');
    for (const [label, bad] of [['http', 'http://example.com'], ['javascript:', 'javascript:alert(1)'], ['data:', 'data:text/html,hi'], ['아이디·비번 담긴 주소', 'https://u:p@example.com'], ['주소 아닌 글', '그냥 글자']]) {
      const r = await trySave(bad);
      check(`설정: ${label} 거절(저장값 그대로)`, r.tone === 'bad' && r.stored === 'https://example.com/work', JSON.stringify(r));
    }
    const cleared = await trySave('');
    check('설정: 비우면 통과(기능 끔)', cleared.tone === 'ok' && (cleared.stored === '' || cleared.stored === null));
    await opener.close();

    // 3d. 옆 칸을 연다.
    check('chrome.sidePanel.open 성공', (await openSidePanel(ctx, id, pageTab)) === 'ok');
    let panel = await attachPanel(ctx, pageTab);
    check('옆 칸 페이지가 열렸다', !!panel);
    if (panel) {
      check('옆 칸 안에 WORKSHEET 앱이 그려졌다', (await panel.ev('document.querySelector("#app")?.dataset.ready === "true" && !!document.querySelector(".workspace")')) === true);
      check('도구 막대(미니 창 단추)가 앱 위에 있다', (await panel.ev('!!document.querySelector(".sheet-bar #mini-button")')) === true);
      check('제목이 WORKSHEET 문서로 되어 있다', (await panel.ev('document.title.includes("WORKSHEET")')) === true);
      check('옆 칸이 열려 있어도 처음에는 수치가 보인다(가리지 않음)', (await panel.ev(panelCovered)) === false);

      // 3e. 합성 그림: 진짜 브라우저 창 + 포털 페이지 + 옆 칸. 밝은 화면은 문서 첫머리(입력),
      //     어두운 화면은 결과 요약까지 내려서 담는다. 테마는 그림에만 쓰고 저장하지 않는다.
      if (DISPLAY) {
        await panel.ev(`document.documentElement.dataset.theme = 'light'; window.scrollTo(0, 0)`);
        await sleep(400);
        shootScreen('composite-light.png');
        await panel.ev(`document.documentElement.dataset.theme = 'dark'; document.querySelector('.doc--result')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -48)`);
        await sleep(400);
        shootScreen('composite-dark.png');
        await panel.ev(`document.documentElement.dataset.theme = 'light'; window.scrollTo(0, 0)`);
      }

      // 3f. 예적금 공시: 컨테이너는 공개 주소에 닿지 못한다. 불러오기를 누르면 터지지 않고
      //     오류 문구가 떠야 한다. 그동안 옆 칸이 낸 요청을 CDP 로 모두 받아 적는다.
      await panel.send('Network.enable');
      const errText = await panel.ev(`(async () => {
        const btn = document.querySelector('.products__load');
        if (!btn) return 'no-button';
        btn.click();
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 250));
          const bad = document.querySelector('.products__message--bad');
          if (bad) return bad.textContent;
        }
        return 'no-error';
      })()`, { userGesture: true });
      check('공시 실패 시 앱이 오류 문구를 보여 준다(안 터진다)', typeof errText === 'string' && errText !== 'no-error' && errText !== 'no-button', String(errText));
      check('오류 뒤에도 앱이 살아 있다', (await panel.ev('!!document.querySelector(".workspace") && document.querySelectorAll(".ws-document, .ws-list").length > 0')) === true);
      const sent = panel.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url).filter((u) => /^https?:/.test(u));
      check('옆 칸이 낸 요청: 공시 창구(/api/fire/products)로 실제로 나갔다', sent.some((u) => u.startsWith(`${PUBLIC}/api/fire/products?`)), JSON.stringify(sent));
      check('옆 칸이 낸 요청: 공개 주소 말고는 한 곳도 없다', sent.length > 0 && sent.every((u) => u.startsWith(`${PUBLIC}/`)), JSON.stringify(sent));

      // 3g. 정책(CSP)이 실제로 막는가: 코드가 실수로 포털을 부르거나 틀에 넣으려 해도 브라우저가 거절한다.
      const fetchProbe = await panel.ev(`fetch('http://127.0.0.1:${port}/csp-fetch-probe').then(() => 'allowed', () => 'blocked')`);
      check('CSP: 옆 칸에서 포털 주소로 fetch 하면 막힌다', fetchProbe === 'blocked', String(fetchProbe));
      const frameProbe = await panel.ev(`new Promise((resolve) => {
        const done = (v) => { frame.remove(); resolve(v); };
        document.addEventListener('securitypolicyviolation', (e) => { if (e.violatedDirective.startsWith('frame-src')) done('blocked'); }, { once: true });
        const frame = document.createElement('iframe');
        frame.src = 'http://127.0.0.1:${port}/csp-frame-probe';
        document.body.append(frame);
        setTimeout(() => done('no-violation'), 3000);
      })`);
      check('CSP: 옆 칸에 포털 페이지를 틀로 넣으려 하면 막힌다', frameProbe === 'blocked', String(frameProbe));
      await panel.detach();

      // 3h. 보스 키: 서비스 워커의 처리를 직접 부른다(단축키는 자동화가 누를 수 없다).
      const boss = () => sw.evaluate(async () => self.worksheetBossKey((await chrome.windows.getLastFocused()).id));
      const panels = () => sw.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).then((c) => c.length));
      const report = await boss();
      check('보스 키가 옆 칸의 수치를 가렸다(covered=panel)', report?.covered === 'panel', JSON.stringify(report));
      await sleep(300);
      // 옆 칸은 신호를 받자마자 스스로 닫히므로 보통은 서비스 워커가 닫을 것이 남지 않는다(closed=[]).
      check('보스 키 뒤 옆 칸이 닫혔다(컨텍스트 0)', (await panels()) === 0, JSON.stringify(report?.closed));
      check('디코이 미설정이면 탭을 열지 않는다', report?.decoy === 'off', JSON.stringify(report?.decoy));
      check('다음에 열 화면을 목록으로 표시했다', (await sw.evaluate(() => chrome.storage.session.get('coverOnNextOpen').then((s) => s.coverOnNextOpen === true))) === true);

      // 3i. 보스 키 뒤에 다시 열면 숫자가 아니라 문서 목록부터 보인다(표시만이 아니라 화면으로 확인).
      check('다시 열기: chrome.sidePanel.open 성공', (await openSidePanel(ctx, id, pageTab)) === 'ok');
      panel = await attachPanel(ctx, pageTab);
      check('다시 연 옆 칸이 문서 목록으로 시작한다(수치 안 보임)', !!panel && (await panel.ev(panelCovered)) === true);
      check('목록 시작 표시는 한 번 쓰고 지웠다', (await sw.evaluate(() => chrome.storage.session.get('coverOnNextOpen').then((s) => s.coverOnNextOpen === undefined))) === true);
      if (DISPLAY && panel) {
        await panel.ev(`document.documentElement.dataset.theme = 'light'`);
        await sleep(300);
        shootScreen('composite-covered.png');
      }
      await panel?.detach();

      // 3j. chrome.sidePanel.close 가 없는 브라우저(크롬 116~140): 화면이 스스로 window.close() 로 닫는다.
      const fallback = await sw.evaluate(async () => {
        const original = chrome.sidePanel.close;
        chrome.sidePanel.close = undefined;
        try { return await self.worksheetBossKey((await chrome.windows.getLastFocused()).id); } finally { chrome.sidePanel.close = original; }
      });
      await sleep(500);
      check('sidePanel.close 없이도 옆 칸이 닫힌다(window.close 대체 경로)', fallback?.covered === 'panel' && fallback.closed.length === 0 && (await panels()) === 0, JSON.stringify(fallback));

      // 3k. 반대로 화면이 스스로 닫지 못할 때의 대비책: 보스 신호 없이 서비스 워커의 닫기만 부른다.
      //     옆 칸이 열린 창에만 sidePanel.close 를 부르고, 그 칸이 실제로 닫혀야 한다.
      check('다시 열기(대비책 시험): chrome.sidePanel.open 성공', (await openSidePanel(ctx, id, pageTab)) === 'ok');
      const sweep = await sw.evaluate(async () => {
        const windowId = (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
        const before = (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).length;
        const closed = await self.worksheetClosePanels(windowId);
        return { windowId, before, closed };
      });
      await sleep(300);
      check('대비책: 옆 칸이 열려 있으면 서비스 워커가 보통 창에 sidePanel.close 를 불러 닫는다',
        sweep.before === 1 && sweep.closed.includes(`sidePanel.close(${sweep.windowId})`) && (await panels()) === 0, JSON.stringify(sweep));
      const idle = await sw.evaluate(async () => self.worksheetClosePanels((await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id));
      check('대비책: 열린 옆 칸이 없으면 sidePanel.close 를 아예 부르지 않는다', Array.isArray(idle) && idle.length === 0, JSON.stringify(idle));
    }

    // 3l. 디코이(업무 탭): 처음에는 새 탭, 다음에는 그 탭을 앞으로 가져온다(새로 만들지 않는다).
    //     로컬은 http 라 https 주소는 실제로 열리지 않지만, 탭을 만들고 가져오는 길은 같다.
    await sw.evaluate((url) => chrome.storage.local.set({ decoyUrl: url }), `https://127.0.0.1:${port}/?work=1`);
    await sleep(100);
    const tabCount = () => sw.evaluate(() => chrome.tabs.query({}).then((t) => t.length));
    const tabsBefore = await tabCount();
    const first = await sw.evaluate(async () => self.worksheetBossKey((await chrome.windows.getLastFocused()).id));
    check('디코이 설정 후 보스 키가 업무 탭을 새로 연다', first?.decoy === 'created' && (await tabCount()) === tabsBefore + 1, JSON.stringify(first));
    await pageTab.bringToFront();
    const second = await sw.evaluate(async () => self.worksheetBossKey((await chrome.windows.getLastFocused()).id));
    check('두 번째 보스 키는 그 탭을 앞으로 가져온다(탭이 늘지 않음)', second?.decoy === 'focused' && (await tabCount()) === tabsBefore + 1, JSON.stringify(second));

    // 3m. 포털 페이지 DOM 은 처음 그대로다(확장이 건드리지 않았다)
    const after = await pageTab.evaluate(() => document.body.innerHTML);
    const secretAfter = await pageTab.evaluate(() => document.getElementById('secret-text')?.textContent ?? '');
    check('포털 페이지 DOM 이 바뀌지 않았다', after === before);
    check('#secret-text 가 그대로다(확장이 읽지도 바꾸지도 않았다)', secretAfter === secretBefore && secretAfter.includes('SECRET-PAGE-TEXT'));
    // 포털 서버가 받은 요청은 시험이 직접 연 페이지(/)와 파비콘뿐이어야 한다. CSP 시험 요청도 닿지 않았다.
    check('포털 서버가 받은 요청은 시험 자신의 페이지 열기뿐(확장발 요청 0)', requests.every((u) => u === '/' || u === '/favicon.ico'), JSON.stringify(requests));
  } finally {
    await ctx.close().catch(() => {});
    await rm(udd, { recursive: true, force: true }).catch(() => {});
    server.close();
  }

  // --- 4. 옆 칸 흉내 페이지(탭) --------------------------------------------
  // 미니 창의 두 길(PiP·팝업)을 Playwright 로 단추를 눌러 확인하고 화면을 담는다. 탭에서는
  // 문서 PiP 가 되므로 PiP 길을 볼 수 있다. 실제 옆 칸에서 어떻게 되는지는 5 절이 본다.
  section('4. 미니 창 두 길 + 화면 담기 (옆 칸 흉내 탭)');
  {
    const mini = await launch(DIST);
    // 평소 동작 중에 정책 위반(CSP)이나 잡히지 않은 오류가 나면 모은다. 정책을 좁혀 화면이 깨지는지 보는 그물이다.
    const problems = [];
    mini.ctx.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) problems.push(m.text()); });
    mini.ctx.on('weberror', (e) => problems.push(String(e.error())));
    async function emulatedPanel(options = {}) {
      const p = await mini.ctx.newPage();
      await p.setViewportSize({ width: 400, height: 900 });
      if (options.noPip) {
        // 문서 PiP 가 없는 환경(구형 크롬·엣지 일부)을 흉내 낸다.
        await p.addInitScript(() => Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true }));
      }
      await p.goto(`chrome-extension://${mini.id}/sidepanel.html`);
      await p.waitForSelector('#app[data-ready="true"] .workspace', { timeout: 10000 });
      return p;
    }
    try {
      // 4a. PiP 길: 문서 PiP 가 되는 곳에서는 단추가 PiP 창을 열고, 그 안의 틀(mini.html)에 앱이 그려진다.
      const panel = await emulatedPanel();
      check('문서 PiP API 가 있다', await panel.evaluate(() => typeof window.documentPictureInPicture === 'object'));
      await panel.click('#mini-button');
      await panel.waitForFunction(() => document.documentElement.dataset.miniPath, null, { timeout: 10000 }).catch(() => {});
      const pip = await panel.evaluate(async () => {
        const win = window.documentPictureInPicture?.window;
        for (let i = 0; i < 40 && win; i++) {
          if (win.document.querySelector('iframe')?.contentDocument?.querySelector('#app')?.dataset.ready === 'true') break;
          await new Promise((r) => setTimeout(r, 100));
        }
        return {
          path: document.documentElement.dataset.miniPath,
          error: document.documentElement.dataset.pipError ?? '',
          alive: !!win,
          size: win ? [win.innerWidth, win.innerHeight] : null,
          frameApp: win?.document.querySelector('iframe')?.contentDocument?.querySelector('#app')?.dataset.ready === 'true',
        };
      });
      console.log(`     → 탭에서 미니 창 길: ${pip.path}${pip.error ? ` (${pip.error})` : ''}`);
      check('탭: 미니 창이 PiP 로 열렸다', pip.path === 'pip' && pip.alive, JSON.stringify(pip));
      if (DISPLAY) check('탭: PiP 창이 요청한 크기(380×640)다', JSON.stringify(pip.size) === '[380,640]', JSON.stringify(pip.size));
      // headless 의 가상 화면은 작아서(800×600) 브라우저가 PiP 를 줄인다. 크기는 실제 창(Xvfb)에서만 본다.
      else console.log(`     (headless: PiP 크기 ${JSON.stringify(pip.size)} — 크기 검사는 Xvfb 에서만)`);
      check("탭: PiP 안의 틀(mini.html)에 앱이 그려졌다(CSP frame-src 'self' 허용)", pip.frameApp === true);
      check('탭: 단추가 눌림 상태', (await panel.getAttribute('#mini-button', 'aria-pressed')) === 'true');
      await panel.click('#mini-button'); // 다시 누르면 닫힌다
      await panel.waitForTimeout(400);
      check('탭: 다시 누르면 PiP 가 닫힌다', (await panel.evaluate(() => !!window.documentPictureInPicture?.window)) === false);

      // 4b. 팝업 길: 문서 PiP 가 없는 브라우저를 흉내 내어(API 를 가려) 단추를 누른다.
      const fallback = await emulatedPanel({ noPip: true });
      await fallback.click('#mini-button');
      await fallback.waitForFunction(() => document.documentElement.dataset.miniPath === 'popup', null, { timeout: 10000 }).catch(() => {});
      check('PiP 없으면 팝업 창으로 대체된다', (await fallback.evaluate(() => document.documentElement.dataset.miniPath)) === 'popup');
      const popup = mini.ctx.pages().find((p) => p.url().endsWith('/mini.html'));
      check('팝업 미니 창(mini.html)이 떴다', !!popup && (await mini.sw.evaluate(() => chrome.windows.getAll().then((ws) => ws.some((w) => w.type === 'popup')))));
      if (popup) {
        await popup.waitForSelector('#app[data-ready="true"] .workspace', { timeout: 10000 }).catch(() => {});
        check('팝업 미니 창 안에 앱이 그려졌다', await popup.evaluate(() => !!document.querySelector('.workspace')));
        await popup.setViewportSize({ width: 380, height: 640 });
        await popup.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
        await popup.screenshot({ path: resolve(SHOTS, 'mini-popup.png') });
      }

      // 4c. 화면 담기(밝은·어두운). page.screenshot 는 디스플레이가 없어도 된다.
      const shot = await emulatedPanel();
      await shot.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
      await shot.waitForTimeout(200);
      await shot.screenshot({ path: resolve(SHOTS, 'panel-light.png') });
      await shot.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await shot.waitForTimeout(200);
      await shot.screenshot({ path: resolve(SHOTS, 'panel-dark.png') });

      // 4d. 가린 상태: 보스 키가 남기는 표시(coverOnNextOpen)를 두고 새로 열어, 실제 시작 경로로 목록이 나오는지 본다.
      await mini.sw.evaluate(() => chrome.storage.session.set({ coverOnNextOpen: true }));
      const covered = await emulatedPanel();
      check('가린 상태: 수치 대신 문서 목록으로 시작한다', (await covered.evaluate(panelCovered)) === true);
      await covered.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
      await covered.waitForTimeout(200);
      await covered.screenshot({ path: resolve(SHOTS, 'covered.png') });

      // 4e. 설정 화면도 담는다.
      const opt = await mini.ctx.newPage();
      await opt.setViewportSize({ width: 900, height: 760 });
      await opt.goto(`chrome-extension://${mini.id}/options.html`);
      await opt.waitForSelector('#decoy');
      await opt.waitForFunction(() => document.getElementById('shortcut')?.textContent !== '확인 중').catch(() => {});
      await opt.screenshot({ path: resolve(SHOTS, 'options.png') });

      // 4f. 보스 키는 단추로 띄운 팝업 미니 창(4b)도 가리고 닫는다(흉내 옆 칸 탭들도 함께 닫힌다).
      const report = await mini.sw.evaluate(() => self.worksheetBossKey());
      await sleep(600);
      const popupLeft = await mini.sw.evaluate(() => chrome.windows.getAll().then((ws) => ws.filter((w) => w.type === 'popup').length));
      check('보스 키가 팝업 미니 창을 닫는다', popupLeft === 0, `${JSON.stringify(report)} · 남은 팝업 ${popupLeft}`);

      // 4g. 미니 창(팝업)이 앞에 있을 때의 보스 키. 단축키는 그 팝업의 창 번호를 넘기고, 팝업은 신호를
      //     받자마자 스스로 닫힌다. 예전에는 서비스 워커가 그 닫히는 팝업에 sidePanel.close 를 불러
      //     브라우저가 통째로 죽었다(크로미움 141, headless 에서 약 열 번에 한 번 SIGSEGV). 되풀이해 본다.
      {
        let crashed = false;
        const onClose = () => { crashed = true; };
        mini.ctx.on('close', onClose);
        const rounds = [];
        for (let i = 0; i < 10 && !crashed; i++) {
          try {
            const popupId = await mini.sw.evaluate((url) => chrome.windows.create({ type: 'popup', url, width: 380, height: 640, focused: true }).then((w) => w.id), `chrome-extension://${mini.id}/mini.html`);
            await sleep(400 + (i % 4) * 80);
            const r = await mini.sw.evaluate((w) => self.worksheetBossKey(w), popupId);
            rounds.push({ popupId, ...r });
          } catch (error) {
            rounds.push({ error: error.message.split('\n')[0] });
            break;
          }
        }
        mini.ctx.off('close', onClose);
        check('미니 창이 앞에 있을 때 보스 키 10번: 브라우저가 죽지 않는다', !crashed && rounds.length === 10 && rounds.every((r) => !r.error), JSON.stringify(rounds.find((r) => r.error) ?? rounds.length));
        check('그때 가린 것은 미니 창이고, 닫히는 팝업에는 sidePanel.close 를 부르지 않는다', rounds.every((r) => r.covered === 'mini-popup' && !r.closed?.some((c) => c.includes(String(r.popupId)))), JSON.stringify(rounds.slice(0, 2)));
        if (crashed) throw new Error('브라우저가 죽어 4 절을 더 진행할 수 없다');
      }

      check('평소 동작 중 CSP 위반·잡히지 않은 오류가 없다(옆 칸·PiP·팝업·설정)', problems.length === 0, problems.join(' | '));
      check('화면 그림(밝은·어두운·가린·미니·설정)을 저장했다',
        ['panel-light.png', 'panel-dark.png', 'covered.png', 'mini-popup.png', 'options.png'].every((f) => existsSync(resolve(SHOTS, f))));
    } finally {
      await mini.ctx.close().catch(() => {});
      await rm(mini.udd, { recursive: true, force: true }).catch(() => {});
    }
  }

  // --- 5. 실제 옆 칸의 미니 창 단추 (Playwright 없이) -----------------------
  section('5. 실제 옆 칸에서 미니 창 단추 (CDP 직접, 자동 멈춤 없음)');
  await realPanelMini();

  // --- 끝 ------------------------------------------------------------------
  section('결과');
  console.log(`통과 ${passed} · 실패 ${failures.length}`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

/**
 * 크로미움을 직접 띄워 실제 옆 칸의 미니 창 단추를 진짜 마우스 입력(CDP)으로 누른다.
 * 새 창을 멈춰 세우는 자동 붙기를 쓰지 않으므로 옆 칸이 PiP 를 부르는 실제 동작이 드러난다.
 */
async function realPanelMini() {
  const { server, port } = await serveFixture();
  const udd = await mkdtemp(resolve(tmpdir(), 'ws-raw-'));
  const args = [
    ...QUIET_ARGS, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${udd}`, '--remote-debugging-port=0',
    `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`,
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    ...(DISPLAY ? [] : ['--headless=new']),
    `http://127.0.0.1:${port}/`,
  ];
  const proc = spawn(chromium.executablePath(), args, { stdio: 'ignore' });
  let ws;
  try {
    const portFile = resolve(udd, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
    const [cdpPort, cdpPath] = (await readFile(portFile, 'utf8')).trim().split('\n');
    ws = new WebSocket(`ws://127.0.0.1:${cdpPort}${cdpPath}`);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let n = 0;
    const pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    const send = (method, params = {}, sessionId) => new Promise((res) => {
      const i = ++n;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: method }); } }, 6000);
    });
    const targets = async () => (await send('Target.getTargets')).result.targetInfos;
    const attach = async (targetId) => (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
    const ev = async (sid, expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sid);
      return r.timeout ? 'TIMEOUT' : r.result?.result?.value;
    };
    // 진짜 마우스 입력. 사용자 제스처로 인정되어 PiP·옆 칸 열기가 허용된다.
    const click = async (sid, selector) => {
      const [x, y] = await ev(sid, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sid);
    };
    const waitFor = async (pred, tries = 50) => { for (let i = 0; i < tries; i++) { const v = await pred(); if (v) return v; await sleep(100); } return null; };

    const swT = await waitFor(async () => (await targets()).find((t) => t.type === 'service_worker' && t.url.endsWith('/background.js')));
    const portalT = await waitFor(async () => (await targets()).find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${port}`)));
    if (!swT || !portalT) { check('직접 띄운 크로미움에 확장·포털이 실렸다', false); return; }
    const extId = new URL(swT.url).host;
    const swS = await attach(swT.targetId);
    await waitFor(async () => (await ev(swS, `typeof self.worksheetBossKey === 'function' && !!chrome.windows`)) === true);
    if (DISPLAY) {
      const { windowId } = (await send('Browser.getWindowForTarget', { targetId: portalT.targetId })).result;
      await send('Browser.setWindowBounds', { windowId, bounds: { ...WINDOW, windowState: 'normal' } });
    }

    // 옆 칸 열기(설정 화면 탭의 진짜 클릭 → chrome.sidePanel.open). 그 뒤 포털 탭으로 돌아온다.
    const openerId = (await send('Target.createTarget', { url: `chrome-extension://${extId}/options.html` })).result.targetId;
    const openerS = await attach(openerId);
    // 새 탭은 about:blank 로 먼저 열린다. 설정 화면이 다 뜬 뒤에 단추를 붙인다.
    await waitFor(async () => (await ev(openerS, `location.protocol === 'chrome-extension:' && document.readyState === 'complete' && !!document.getElementById('decoy')`)) === true);
    await ev(openerS, `(() => { const b = document.createElement('button'); b.id = '__open'; b.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:60px;z-index:9'; b.onclick = async () => { const w = await chrome.windows.getCurrent(); chrome.sidePanel.open({ windowId: w.id }).then(() => (b.dataset.r = 'ok'), (e) => (b.dataset.r = 'err ' + e.message)); }; document.body.append(b); })()`);
    await click(openerS, '#__open');
    const opened = await waitFor(async () => ev(openerS, `document.querySelector('#__open').dataset.r`));
    await send('Target.activateTarget', { targetId: portalT.targetId });
    await send('Target.closeTarget', { targetId: openerId });
    const panelT = await waitFor(async () => (await targets()).find((t) => t.url.endsWith('/sidepanel.html')));
    check('직접 띄운 크로미움에서 옆 칸이 열렸다', opened === 'ok' && !!panelT, String(opened));
    if (!panelT) return;
    const panelS = await attach(panelT.targetId);
    await waitFor(async () => (await ev(panelS, `document.querySelector('#app')?.dataset.ready === 'true'`)) === true);

    // 미니 창 단추를 진짜로 누른다.
    await click(panelS, '#mini-button');
    const path = await waitFor(async () => ev(panelS, `document.documentElement.dataset.miniPath`), 60);
    const reason = await ev(panelS, `document.documentElement.dataset.pipError || ''`);
    console.log(`     → 실제 옆 칸에서 미니 창 길: ${path}${reason ? ` (PiP: ${reason})` : ''}`);
    let visible = false;
    if (path === 'popup') {
      const miniT = await waitFor(async () => (await targets()).find((t) => t.url.endsWith('/mini.html')));
      if (miniT) {
        const miniS = await attach(miniT.targetId);
        visible = !!(await waitFor(async () => (await ev(miniS, `document.querySelector('#app')?.dataset.ready === 'true' && innerWidth > 0`)) === true));
      }
    } else if (path === 'pip') {
      visible = (await ev(panelS, `(() => { const w = window.documentPictureInPicture?.window; return !!w && !w.closed && w.innerWidth > 0; })()`)) === true;
    }
    check('실제 옆 칸: 미니 창 단추가 눈에 보이는 창을 연다(죽은 PiP 에 멈추지 않음)', (path === 'popup' || path === 'pip') && visible, `${path} ${reason}`);

    // 합성 그림: 옆 칸은 닫고 미니 창만 포털 위에 띄워 둔 모습. (창 관리자가 없는 Xvfb 라 창 테두리는 없다.)
    if (DISPLAY && visible) {
      // 포털 탭은 이미 앞에 있다. 탭을 다시 활성화하면 창 관리자 없는 화면에서 큰 창이 미니 창 위로 올라온다.
      await ev(swS, `chrome.windows.getAll().then((ws) => Promise.all(ws.filter((w) => w.type === 'normal').map((w) => chrome.sidePanel.close({ windowId: w.id }).catch(() => {}))))`);
      await sleep(600);
      shootScreen('composite-mini.png');
      const bounds = await ev(swS, `chrome.windows.getAll().then((ws) => ws.find((w) => w.type === 'popup')).then((w) => w && { left: w.left, top: w.top, width: w.width, height: w.height })`);
      if (bounds) markWindow('composite-mini.png', bounds, '미니 창 = 페이지와 별개인 팝업 창 (주황 테두리는 설명용 덧그림)');
    }

    // 보스 키가 실제(멈추지 않은) 브라우저에서도 미니 창을 닫는다.
    const report = await ev(swS, `self.worksheetBossKey()`);
    await sleep(600);
    const left = (await targets()).filter((t) => t.url.endsWith('/mini.html') || t.url.endsWith('/sidepanel.html')).length;
    check('실제 브라우저: 보스 키 뒤 옆 칸·미니 창이 모두 사라졌다', left === 0, `${JSON.stringify(report)} · 남은 ${left}`);
  } catch (error) {
    check('5 절 실행', false, String(error?.stack ?? error));
  } finally {
    try { ws?.close(); } catch { /* 이미 닫힘 */ }
    if (proc.exitCode === null) {
      const exited = new Promise((r) => proc.once('exit', r));
      proc.kill();
      await Promise.race([exited, sleep(3000)]);
    }
    await rm(udd, { recursive: true, force: true }).catch(() => {});
    server.close();
  }
}

run().catch((error) => {
  console.error('e2e 실행 중 오류:', error);
  process.exitCode = 1;
});
