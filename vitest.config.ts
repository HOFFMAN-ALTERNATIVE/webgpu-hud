import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['src/core/**/*.ts', 'src/sim/**/*.ts', 'src/ui/sparkline.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
  },
});
