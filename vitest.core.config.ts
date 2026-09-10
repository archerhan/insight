import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * 核心门槛（M0 起设卡）：状态机与树操作等纯领域函数分支覆盖 ≥85%。
 * 与 test:coverage（全仓执行代码行 ≥70%）分开设卡。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir + 'src',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/lib/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/lib/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 90,
        lines: 85,
      },
    },
  },
});
