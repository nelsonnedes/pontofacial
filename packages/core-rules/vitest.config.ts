import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,js}'],
    coverage: {
      reporter: ['text', 'json'],
      thresholds: {
        lines: 60,
        branches: 50
      }
    }
  }
});
