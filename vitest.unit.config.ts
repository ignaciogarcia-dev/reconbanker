import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'unit',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'client/**', 'tests/integration/**'],
    environment: 'node',
    globals: false,
    setupFiles: ['tests/setup.ts'],
  },
})
