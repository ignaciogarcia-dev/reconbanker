<div align="center">
  <a href="#">
    <img src="client/public/readme/readme-banner.jpg" alt="ReconBanker" />
  </a>

  <h1>ReconBanker</h1>

  <p>Automated bank-to-order reconciliation for financial operations teams.</p>

  <p><a href="#quick-start">Get Started</a> · <a href="#documentation">Documentation</a> · <a href="#api-reference">API Reference</a></p>
</div>

---

ReconBanker is a self-hosted reconciliation engine that scrapes bank transactions using browser automation, polls pending orders from customer ERP systems, and matches them using a deterministic + heuristic engine. When a match is found, it notifies the customer system via configurable webhooks.

## What it does

- **Scrapes bank transactions** from customer bank accounts using Playwright browser automation (Itaú, Mi Dinero, and more)
- **Polls pending orders** from customer ERP or order-management systems via HTTP
- **Reconciles transactions to orders** using a rule-based engine (exact amount + date window) and a fuzzy sender-name heuristic
- **Notifies customers** via webhook when a match is found, including match type and transaction detail
- Operates in a **multi-account, multi-bank** model - each account has its own config, scrape schedule, and webhook

## Feature surface

### Reconciliation engine

- Exact amount matching (configurable currency support)
- 5-day date window rule
- Fuzzy sender-name heuristic scoring (0–1)
- Ambiguity detection when multiple candidates score equally
- Per-request attempt history with unmatched reasons

### Account management

- Register accounts linked to supported banks
- Per-account configuration: polling endpoint, webhook URL, authentication headers
- Manual or scheduled scraping and polling triggers
- Script versioning: promote bank scripts from `review` → `active`

### Async job processing

- Four BullMQ queues: `order-ingestion`, `bank-scrape`, `conciliation`, `webhook`
- Domain event bus: `TransactionIngested` → conciliation, `ConciliationMatched` → webhook
- Configurable polling and scraping intervals via env vars

### Frontend dashboard

- Login / register
- Account list and per-account config
- Conciliation requests with status, attempt history, and matched transaction detail
- Bank and script management
- i18n support (i18next)

## Tech stack

| Layer              | Technology                                    |
| ------------------ | --------------------------------------------- |
| Backend runtime    | Node.js + TypeScript (tsx watch)              |
| Web framework      | Express v5                                    |
| Database           | PostgreSQL 16 (pg driver, raw SQL migrations) |
| Queue / cache      | Redis 7 + BullMQ                              |
| Browser automation | Playwright                                    |
| Authentication     | JWT + bcrypt                                  |
| Frontend           | React 19 + Vite 8                             |
| UI                 | Tailwind CSS v4, shadcn/ui                    |
| HTTP client        | Axios + TanStack Query                        |
| i18n               | i18next                                       |

## Quick start

```bash
git clone <repo-url>
cd reconbanker

cp .env.example .env
# Edit .env with your values

./setup.sh
```

`setup.sh` installs all dependencies, starts Docker (PostgreSQL + Redis), runs migrations, and launches both backend and frontend.

- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:5173`

See [docs/getting-started.md](docs/getting-started.md) for manual setup and environment variable reference.

## Environment variables

**Required:**

| Variable       | Description                   |
| -------------- | ----------------------------- |
| `DATABASE_URL` | PostgreSQL connection string  |
| `REDIS_URL`    | Redis connection string       |
| `JWT_SECRET`   | Secret for signing JWT tokens |

**Optional:**

| Variable                   | Default       | Description                                                                            |
| -------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `PORT`                     | `3000`        | Backend API port                                                                       |
| `NODE_ENV`                 | `development` | Environment                                                                            |
| `POLLING_INTERVAL_SECONDS` | `60`          | How often to poll customer order endpoints                                             |
| `SCRAPE_INTERVAL_SECONDS`  | `600`         | How often to run bank scraping                                                         |
| `BANK_SCRAPE_CONCURRENCY`  | `2`           | Maximum number of bank scraping jobs, and Playwright browsers, to run at the same time |

## Development

Common commands:

```bash
# Run everything (recommended)
./setup.sh

# Backend only (watch mode)
pnpm dev

# Frontend only
cd client && pnpm dev

# Database migrations
pnpm migrate

# Build backend
pnpm build
```

For a detailed workflow see [docs/development.md](docs/development.md).

## Documentation

| File                                               | Purpose                                    |
| -------------------------------------------------- | ------------------------------------------ |
| [docs/getting-started.md](docs/getting-started.md) | Setup, env vars, manual run guide          |
| [docs/architecture.md](docs/architecture.md)       | Bounded contexts, DDD patterns, job queues |
| [docs/api-reference.md](docs/api-reference.md)     | REST endpoints and request/response shapes |
| [docs/repository-map.md](docs/repository-map.md)   | Compact source tree reference              |

## License

MIT
