import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
    exclude: ['node_modules', 'out', '.next', 'src/test/firestore-rules.test.ts'],
    reporters: ['default', 'html'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'out/',
        '.next/'
      ],
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 60,
        statements: 60
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@packages': resolve(__dirname, '../../packages')
    }
  }
})
