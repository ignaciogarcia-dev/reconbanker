import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'client/**'],
    environment: 'node',
    globals: false,
    setupFiles: ['tests/integration/setup.ts'],
    // Integration tests share a single Postgres database — run them serially
    // so truncations from one suite don't race against another.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
})
