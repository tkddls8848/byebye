import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { outDir: 'dist' },
  server: {
    proxy: { '/api/': 'http://127.0.0.1:8787' },
  },
  test: { include: ['src/**/*.test.ts', 'worker/**/*.test.ts'] },
});
