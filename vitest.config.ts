import { defineConfig } from 'vitest/config'

// Top-level workspace: registers the unit and integration projects so a single
// `vitest run` (or `--coverage`) exercises both suites and reports merged
// numbers. Each project keeps its own setup/execution semantics (unit runs in
// parallel; integration runs serially against a real Postgres). To target one
// project explicitly: `vitest run --project unit` or `--project integration`.
export default defineConfig({
  test: {
    projects: ['./vitest.unit.config.ts', './vitest.integration.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/shared/infrastructure/db/migrations/**',
      ],
      reporter: ['text', 'html'],
    },
  },
})
