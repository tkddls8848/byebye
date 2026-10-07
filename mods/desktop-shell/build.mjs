/**
 * 데스크 셸 전체 빌드.
 *
 *   node mods/desktop-shell/build.mjs
 *
 * 1. 우리 화면(앱 칸·머리줄·칸막이)을 Vite 로 → dist-mods/desktop-shell/app/
 * 2. 메인 프로세스와 프리로드 둘을 esbuild 로 → mods/desktop-shell/out/
 *
 * 프리로드는 샌드박스 안에서 돌므로 electron 말고는 아무것도 require 할 수 없다.
 * 그래서 하나의 CommonJS 파일로 묶는다.
 */
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { build as vite } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

await vite({ configFile: resolve(here, 'vite.config.ts'), logLevel: 'warn' });

const out = resolve(here, 'out');
rmSync(out, { recursive: true, force: true });
await bundle({
  entryPoints: {
    main: resolve(here, 'src/main/main.ts'),
    'preload-app': resolve(here, 'src/preload/app.ts'),
    'preload-chrome': resolve(here, 'src/preload/chrome.ts'),
  },
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  // 사람이 읽고 검토할 수 있게 줄이지 않는다.
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
});

console.log('built: dist-mods/desktop-shell/app/, mods/desktop-shell/out/');
