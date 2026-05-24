import { defineConfig } from 'vitest/config'

// Aggregates unit and integration test projects under a single run so coverage
// numbers reflect the union of both suites. Each project keeps its own setup
// and execution semantics (the unit suite runs in parallel; the integration
// suite is serial against a real Postgres). Run with:
//   pnpm test:all
//   pnpm test:all -- --coverage
export default defineConfig({
  test: {
    projects: ['./vitest.config.ts', './vitest.integration.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/shared/infrastructure/db/migrations/**',
      ],
      reporter: ['text', 'text-summary', 'html'],
    },
  },
})
