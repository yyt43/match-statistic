import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

// 与 vite.config.ts 一致：测试里也注入构建期版本号，避免 __APP_VERSION__ 未定义。
const appVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version as string;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  test: {
    // 提供 localStorage 等浏览器存储的最小 stub，避免 node 环境下的回退路径噪声。
    setupFiles: ['./vitest.setup.ts'],
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        // 门槛按当前实测值留 ~5 个点余量设置（2026-10-30：69.6/58.5/76.1/72.9），
        // 防止覆盖率悄悄下滑，同时不阻塞正常的小改动。
        statements: 64,
        branches: 53,
        functions: 70,
        lines: 67,
      },
    },
  },
});
