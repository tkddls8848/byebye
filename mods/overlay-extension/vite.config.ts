/**
 * 사이드 시트 확장 빌드.
 *
 *   npx vite build --config mods/overlay-extension/vite.config.ts              → dist-mods/overlay-extension
 *   npx vite build --config mods/overlay-extension/vite.config.ts --mode whale → dist-mods/overlay-extension-whale
 *
 * 화면 코드는 하나이고 설명서(manifest.json)만 갈린다. 쓸 수 있는 API 는 실행 중에
 * 살펴서 고른다(크롬은 chrome.sidePanel, 웨일은 whale.sidebarAction).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { makeManifest, type Target } from './manifest';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const VERSION = '0.1.0';

function manifest(target: Target): Plugin {
  return {
    name: 'worksheet-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(makeManifest(target, VERSION), null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const target: Target = mode === 'whale' ? 'whale' : 'chrome';
  return {
    root: here,
    // 확장 안에서는 어느 쪽이든 chrome-extension://<id>/ 가 뿌리다. 상대 경로로 둔다.
    base: './',
    publicDir: resolve(here, 'public'),
    envDir: here,
    build: {
      outDir: resolve(repo, target === 'whale' ? 'dist-mods/overlay-extension-whale' : 'dist-mods/overlay-extension'),
      emptyOutDir: true,
      // 확장은 모든 파일이 이미 디스크에 있다. 미리 불러오기 보조 코드는 필요 없다.
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: {
          sidepanel: resolve(here, 'sidepanel.html'),
          mini: resolve(here, 'mini.html'),
          options: resolve(here, 'options.html'),
          background: resolve(here, 'src/background.ts'),
        },
        output: {
          // 설명서가 이름으로 가리키는 서비스 워커만 고정된 이름을 준다.
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
          // 앱 CSS(styles → fire → workspace)는 한 조각에 모은다. 설정 화면도 styles.css 를
          // 쓰는 탓에 조각이 갈라지면 웹 앱과 다른 순서로 실려 같은 우선순위의 규칙이 뒤집힌다.
          manualChunks: (id) => (id.startsWith(resolve(repo, 'src')) && id.endsWith('.css') ? 'app-styles' : undefined),
        },
      },
    },
    plugins: [manifest(target)],
  };
});
