import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
  },
});
