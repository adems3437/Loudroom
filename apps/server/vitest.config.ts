import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nest's dependency injection needs decorator metadata, which only SWC emits here.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  oxc: false,
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Files share the test database and Redis, so they run one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
