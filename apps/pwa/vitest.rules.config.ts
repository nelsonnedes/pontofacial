import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/firestore-rules.test.ts'],
    reporters: ['default']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@packages': resolve(__dirname, '../../packages')
    }
  }
});
