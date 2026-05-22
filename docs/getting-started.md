# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10 - `npm install -g pnpm`
- [Docker](https://www.docker.com/) with Compose v2
- A Playwright Chromium browser, only if you run **real** bank scrapes or persistent
  bank sessions locally (see [Bank scraping & persistent sessions](#bank-scraping--persistent-sessions))

## One-command setup

```bash
cp .env.example .env
# Edit .env with your values
./setup.sh
```

This script:

1. Pulls the latest git changes
2. Installs root and client dependencies (`pnpm install`)
3. Starts PostgreSQL and Redis via Docker Compose
4. Waits for PostgreSQL to be healthy
5. Runs all database migrations (`pnpm migrate`)
6. Starts the backend in watch mode (port 3000)
7. Starts the Vite frontend dev server (port 5173)

Press `Ctrl+C` to stop both processes.

## Manual setup

### 1. Install dependencies

```bash
pnpm install        # root (backend)
cd client
pnpm install        # frontend
```

### 2. Start infrastructure

```bash
docker compose up -d
```

Services started:
- PostgreSQL 16 on `localhost:5432`
- Redis 7 on `localhost:6379`

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://reconbanker:reconbanker@localhost:5432/reconbanker
REDIS_URL=redis://localhost:6379
PORT=3000
NODE_ENV=development
JWT_SECRET=change_this_to_a_long_random_secret

POLLING_INTERVAL_SECONDS=600
SCRAPE_INTERVAL_SECONDS=1200
EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS=3600
BANK_SCRAPE_CONCURRENCY=2
```

### 4. Run migrations

```bash
pnpm migrate
```

Migrations run in order from `src/shared/infrastructure/db/migrations/`. They are idempotent - safe to run multiple times.

### 5. Start the backend

```bash
pnpm dev
```

Runs `tsx watch src/index.ts` - restarts on file changes.

### 6. Start the frontend

In a separate terminal:

```bash
cd client
pnpm dev
```

Vite dev server starts at `http://localhost:5173`. Frontend API calls go to `/api`, which Vite proxies to `http://localhost:3000`.

If you need to override the frontend API base URL, define `VITE_API_BASE_URL` in `client/.env`, `client/.env.local`, or export it in the shell before running `pnpm dev` / `pnpm build` in `client/`.

## Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `JWT_SECRET` | Yes | - | Secret for signing JWT tokens - use a long random string in production |
| `PORT` | No | `3000` | Backend API port |
| `NODE_ENV` | No | `development` | Set to `production` to disable stack traces in error responses |
| `POLLING_INTERVAL_SECONDS` | No | `600` | Interval for polling customer order endpoints |
| `SCRAPE_INTERVAL_SECONDS` | No | `1200` | Interval for running bank scraping jobs |
| `EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS` | No | `3600` | Interval for expiring stale conciliation requests |
| `BANK_SCRAPE_CONCURRENCY` | No | `2` | Maximum number of bank scraping jobs, and Playwright browsers, to run at the same time |
| `PLAYWRIGHT_PROFILES_DIR` | No | `./playwright-profiles` | Directory where persistent bank sessions store per-account browser profiles (gitignored) |
| `SESSION_HEALTHCHECK_SECONDS` | No | `75` | Interval at which the scheduler health-checks live persistent bank sessions |
| `PERSISTENT_POLL_INTERVAL_MS` | No | `60000` | How often a running persistent session polls the bank for new transactions |
| `VITE_API_BASE_URL` | No | `/api` | Frontend API base URL (read by Vite from `client/.env*` or exported shell env); set only when the API is served from a different origin |

> The persistent-session variables (`PLAYWRIGHT_PROFILES_DIR`, `SESSION_HEALTHCHECK_SECONDS`,
> `PERSISTENT_POLL_INTERVAL_MS`) all have sensible defaults and are not listed in `.env.example`.
> Set them only to override the defaults.

## Bank scraping & persistent sessions

The backend uses [Playwright](https://playwright.dev/) (already a dependency, no extra
install for normal app development) to drive real bank scrapes and the persistent bank
sessions introduced by that feature. To run those flows locally against a real browser:

1. Install the Chromium browser Playwright drives:

   ```bash
   npx playwright install chromium
   ```

2. Provide a display. Both `PlaywrightRunner` and `PersistentPlaywrightRunner` launch
   Chromium with `headless: false`, so a running X server / desktop session is required.
   On **WSL2** there is no display by default — use WSLg (Windows 11) or a separate X
   server, otherwise the browser launch fails.

3. Apply migrations up to and including `028`–`031`, which add the persistent-session
   schema and seeds (`pnpm migrate` applies all of these).

Per-account browser profiles are stored under `PLAYWRIGHT_PROFILES_DIR`
(default `./playwright-profiles`, gitignored). See the env reference above for
`SESSION_HEALTHCHECK_SECONDS` and `PERSISTENT_POLL_INTERVAL_MS`.

## Running tests

```bash
# Unit tests (vitest)
pnpm test

# Integration tests — separate config, run serially, need a Postgres test DB
pnpm test:integration
```

`pnpm test:integration` uses `vitest.integration.config.ts`. Its setup
(`tests/integration/setup.ts`) connects to `DATABASE_URL_TEST` if set, otherwise derives
a `reconbanker_test` database from `DATABASE_URL` (falling back to
`postgres://reconbanker:reconbanker@localhost:5432/reconbanker_test`). It creates that
database if missing, runs all migrations against it, and seeds canonical fixtures, so the
Docker Compose Postgres started above is sufficient — no manual test-DB creation needed.

## Production build

```bash
# Backend
pnpm build         # compiles TypeScript to dist/
pnpm start         # runs dist/index.js

# Frontend
cd client
pnpm build         # outputs to client/dist/
pnpm preview       # preview the production build locally
```
