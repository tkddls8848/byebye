/**
 * 확장 아이콘(PNG)을 만든다. 결과는 public/icons 에 두고 함께 커밋한다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node mods/overlay-extension/scripts/make-icons.mjs
 *
 * 글자 로고 대신 "표 문서" 그림을 쓴다. 초록 네모에 흰 글자 한 자는 포털 로고와
 * 헷갈리기 쉬워서 피한다. 색은 앱의 --ws-accent(#008c48)다.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// playwright 는 package.json 에 넣지 않는다. NODE_PATH(전역 설치)로 찾고, 없으면 기본 설치 자리를 본다.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); }
}
const { chromium } = loadPlaywright();

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/icons');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <path d="M26 8h52l30 30v76a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z" fill="#ffffff" stroke="#6f7780" stroke-width="7" stroke-linejoin="round"/>
  <path d="M78 8v24a6 6 0 0 0 6 6h24" fill="#e7e9ec" stroke="#6f7780" stroke-width="7" stroke-linejoin="round"/>
  <rect x="33" y="52" width="62" height="56" rx="4" fill="#008c48"/>
  <path d="M33 71h62 M33 89h62 M57 52v56" stroke="#ffffff" stroke-width="6"/>
</svg>`;

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: resolve(out, `icon-${size}.png`), omitBackground: true });
}
await browser.close();
console.log(`아이콘을 ${out} 에 만들었습니다.`);
