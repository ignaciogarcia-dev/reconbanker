# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10 - `npm install -g pnpm`
- [Docker](https://www.docker.com/) with Compose v2

## One-command setup

```bash
cp .env.example .env
# Edit .env with your values
./setup.sh
```

This script:

1. Installs root and client dependencies (`pnpm install`)
2. Starts PostgreSQL and Redis via Docker Compose
3. Waits for PostgreSQL to be healthy
4. Runs all database migrations (`pnpm migrate`)
5. Starts the backend in watch mode (port 3000)
6. Starts the Vite frontend dev server (port 5173)

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

POLLING_INTERVAL_SECONDS=60
SCRAPE_INTERVAL_SECONDS=600
BANK_SCRAPE_CONCURRENCY=3
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

Vite dev server starts at `http://localhost:5173`. API calls are proxied to `http://localhost:3000`.

## Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `JWT_SECRET` | Yes | - | Secret for signing JWT tokens - use a long random string in production |
| `PORT` | No | `3000` | Backend API port |
| `NODE_ENV` | No | `development` | Set to `production` to disable stack traces in error responses |
| `POLLING_INTERVAL_SECONDS` | No | `60` | Interval for polling customer order endpoints |
| `SCRAPE_INTERVAL_SECONDS` | No | `600` | Interval for running bank scraping jobs |
| `BANK_SCRAPE_CONCURRENCY` | No | `3` | Maximum number of bank scraping jobs, and Playwright browsers, to run at the same time |

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
