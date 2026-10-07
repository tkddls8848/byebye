/**
 * 데스크 셸의 우리 화면 빌드(앱 칸·머리줄·칸막이).
 *
 *   npx vite build --config mods/desktop-shell/vite.config.ts
 *
 * 결과는 dist-mods/desktop-shell/app/ 에 쌓이고, 메인 프로세스가 worksheet://app/
 * 으로 내준다. 메인·프리로드는 build.mjs 가 esbuild 로 따로 묶는다.
 */
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../..');
const src = resolve(here, 'src/renderer');
const outDir = resolve(repo, 'dist-mods/desktop-shell/app');

/** 창 아이콘. 웹 앱의 W 표식을 그대로 쓴다. */
function windowIcon(): Plugin {
  return {
    name: 'worksheet-desk-icon',
    apply: 'build',
    closeBundle() {
      copyFileSync(resolve(repo, 'public/icon-512.png'), resolve(outDir, 'icon.png'));
    },
  };
}

export default defineConfig({
  root: src,
  base: './',
  publicDir: false,
  plugins: [windowIcon()],
  build: {
    outDir,
    emptyOutDir: true,
    // CSP 가 인라인 스크립트를 막는다. 미리 읽기 보조 스크립트도 넣지 않는다.
    modulePreload: { polyfill: false },
    // data: 로 끼워 넣지 않고 파일로 둔다. CSP 와 검토가 단순해진다.
    assetsInlineLimit: 0,
    // CSS 를 한 파일로 합친다. 나눠 두면 styles.css 가 계산기 CSS 뒤에 붙어 웹 앱과
    // 겹침 순서가 달라진다(styles → fire → workspace 순서여야 한다).
    cssCodeSplit: false,
    target: 'chrome130',
    rollupOptions: {
      input: {
        index: resolve(src, 'index.html'),
        toolbar: resolve(src, 'toolbar.html'),
        splitter: resolve(src, 'splitter.html'),
      },
    },
  },
});
