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
| `pnpm test:integration` | Run backend integration tests |
| `pnpm typecheck` | Type-check backend source and tests |

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
4. Use `POST /scripts/:scriptId/promote` to activate it

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

The frontend Axios client calls `http://localhost:3000` directly. `client/vite.config.ts` also defines a `/api` proxy for local experiments, but the app's current API calls do not depend on that prefix.
