# Development

## Common commands

### Backend (run from project root)

| Command | Description |
|---|---|
| `pnpm dev` | Start backend in watch mode (tsx watch) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled backend from `dist/` |
| `pnpm migrate` | Run all pending database migrations |
| `pnpm test` | Run backend unit tests |
| `pnpm test:watch` | Run backend tests in watch mode |
| `pnpm test:coverage` | Run backend tests with coverage |
| `pnpm test:integration` | Run backend integration tests (separate `vitest.integration.config.ts`, run serially, need a Postgres test DB — see [below](#integration-tests)) |
| `pnpm typecheck` | Type-check backend source and tests (`tsc --noEmit` + `tsc -p tsconfig.test.json`) |

### Frontend (run from `client/`)

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server on port 5173 |
| `pnpm build` | Type-check and build for production |
| `pnpm preview` | Preview the production build |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run frontend unit/component tests |
| `pnpm test:watch` | Run frontend tests in watch mode |
| `pnpm test:coverage` | Run frontend tests with coverage |
| `pnpm typecheck:test` | Type-check frontend tests |

### Infrastructure

| Command | Description |
|---|---|
| `docker compose up -d` | Start PostgreSQL and Redis |
| `docker compose down` | Stop services |
| `docker compose down -v` | Stop services and delete volumes |

## Integration tests

`pnpm test:integration` uses `vitest.integration.config.ts` (separate from the unit-test
config) and runs the suites serially. The setup file (`tests/integration/setup.ts`):

1. Resolves a test database from `DATABASE_URL_TEST`, or derives a `reconbanker_test`
   database from `DATABASE_URL` (default `postgres://reconbanker:reconbanker@localhost:5432/reconbanker_test`).
2. Creates that database if it does not exist.
3. Runs all migrations against it (`pnpm migrate`).
4. Seeds canonical fixtures (`mi-dinero` bank + active script) stamped in the past.

The Docker Compose Postgres (below) is enough; no manual test-DB setup is required.

## Bank scraping & persistent sessions

Real bank scrapes and persistent bank sessions run through Playwright. The runners
(`PlaywrightRunner`, `PersistentPlaywrightRunner`) launch Chromium with `headless: false`,
so running these locally requires:

- The Chromium browser installed: `npx playwright install chromium`
- A display / X server (note: WSL2 needs WSLg or an external X server)
- Migrations `028`–`031` applied (`pnpm migrate`)

Persistent sessions store a per-account browser profile under `PLAYWRIGHT_PROFILES_DIR`
(default `./playwright-profiles`, gitignored). Tuning env vars: `SESSION_HEALTHCHECK_SECONDS`
(default 75) and `PERSISTENT_POLL_INTERVAL_MS` (default 60000). See `docs/getting-started.md`
for the full env reference.

## Adding a database migration

Create a new SQL file in `src/shared/infrastructure/db/migrations/` following the naming convention:

```
NNN_description.sql
```

Where `NNN` is the next sequential number. The migration runner applies files in filename order and tracks which have been applied.

## Adding a bank script

1. Create a folder under `src/contexts/script-engine/infrastructure/scripts/<bank-code>/`
2. Write the Playwright automation script
3. Insert a row into `bank_scripts` with `status = 'review'`
4. Use `POST /api/scripts/:scriptId/promote` to activate it

## Adding a new bounded context

1. Create `src/contexts/<name>/` with `domain/`, `infrastructure/`, and `application/` subdirectories
2. Define domain entities extending `Entity` or `AggregateRoot`
3. Define repository interfaces in `domain/`
4. Implement repositories in `infrastructure/` using the PostgreSQL client from `src/shared/infrastructure/db/client.ts`
5. Write use cases in `application/`
6. Register routes in `src/api/routes/` and mount them in `src/api/server.ts`
7. Wire workers and event handlers in `src/index.ts`

## Ports

| Service | Port |
|---|---|
| Backend API | 3000 |
| Frontend (Vite) | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |

The frontend Axios client calls `/api` by default. In development, `client/vite.config.ts` proxies `/api` to `http://localhost:3000`; in production, the backend serves the built SPA and API from the same origin.
