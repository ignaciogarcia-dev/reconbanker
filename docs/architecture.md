# Architecture

ReconBanker is a full-stack TypeScript monorepo built around Domain-Driven Design principles with an async job processing backbone.

## Bounded contexts

The backend is organized into five bounded contexts under `src/contexts/`:

### `account`

Manages accounts and banks.

- **Account** - links a customer to a bank, holds status
- **Bank** - defines a supported bank (code, name, login URL)
- **AccountConfig** - per-account webhook URL, polling endpoint, auth settings

### `banking`

Handles bank scraping and transaction ingestion.

- **BankTransaction** - a transaction scraped from a bank account
- **ScrapeRun / ScrapeStep** - audit trail of each scraping execution
- **ScriptEnginePort** - port abstraction; `PlaywrightRunner` is the adapter

### `conciliation`

The reconciliation engine - the core of the product.

- **ConciliationRequest** - an order received from a customer system, to be matched
- **ConciliationAttempt** - each matching attempt with its result and reason
- **ConciliatedTransaction** - the confirmed match between a request and a transaction
- **ConciliationEngine** - runs rules and heuristics to produce a `MatchResult`

### `script-engine`

Manages Playwright automation scripts.

- **BankScript** - versioned script associated with a bank
- Scripts flow from `review` → `active` via `PromoteScriptUseCase`
- Supported banks: Itaú, Mi Dinero

### `user`

Manages authentication and user preferences.

- **User** - authenticated application user
- **Operation mode** - switches the frontend flow between reconciliation and passthrough movement notification, and is honored by selected background processing paths
- `RegisterUserUseCase`, `LoginUseCase`, `GetCurrentUserUseCase`, and `ChangeOperationModeUseCase`

## Reconciliation algorithm

`ConciliationEngine` processes each request in three phases:

1. **Deterministic filters** - applied to all candidate transactions:
   - `ExactAmountRule` - amount must match exactly
   - `DateWindowRule` - transaction must be within 5 days of request creation date

2. **Heuristic scoring** - applied to candidates that pass all filters:
   - `FuzzySenderHeuristic` - fuzzy string match between `sender_name` fields (score 0–1)

3. **Result resolution**:
   - One candidate with best score → `matched`
   - Multiple candidates with equal top score → `ambiguous`
   - No candidates pass filters → `not_found`

## Job queue system

Six BullMQ queues backed by Redis:

```
order-ingestion       →  PollPendingOrdersUseCase
bank-scrape           →  RunBankScrapeUseCase
conciliation          →  RunConciliationUseCase
tx-conciliation       →  ProcessIncomingTransactionUseCase
webhook               →  NotifyWebhookUseCase
bank-movement-webhook →  NotifyBankMovementUseCase
```

The Scheduler (`src/shared/infrastructure/queues/Scheduler.ts`) enqueues recurring polling, scraping, and stale-request expiry jobs based on `POLLING_INTERVAL_SECONDS`, `SCRAPE_INTERVAL_SECONDS`, and `EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS`.

## Domain event bus

An in-memory pub/sub bus (`EventBus`) connects contexts without direct coupling:

| Event | Published by | Handled by |
|---|---|---|
| `AccountCreated` | `CreateAccountUseCase` | - |
| `TransactionIngested` | `RunBankScrapeUseCase` | Runs transaction ingestion handling and enqueues bank movement webhook notification |
| `ConciliationMatched` | `RunConciliationUseCase` | Enqueues webhook notification |
| `ConciliationFailed` | `RunConciliationUseCase` | - |
| `ConciliationExpired` | `ExpireStaleRequestsUseCase` | - |
| `ScrapeRunFailed` | `RunBankScrapeUseCase` | - |
| `OperationModeChanged` | `ChangeOperationModeUseCase` | - |
| `ScriptPromoted` | `PromoteScriptUseCase` | - |

## Shared kernel

`src/shared/domain/` provides base classes:

- `Entity` - base class with identity and equality
- `AggregateRoot extends Entity` - adds domain event collection and publishing
- `ValueObject` - structural equality helpers

## Database

Raw SQL migrations in `src/shared/infrastructure/db/migrations/`. The migration runner (`migrate.ts`) applies them in filename order and is idempotent.

Key tables:

| Table | Purpose |
|---|---|
| `users` | Authentication |
| `banks` | Supported bank definitions (`pending`, `onboarding`, `ready`, `failed`) |
| `accounts` | Customer bank accounts |
| `account_config` | Per-account webhook, polling, expiry-notification, extra-field, and silent-ingestion config |
| `bank_credentials` | Encrypted login credentials per account |
| `bank_transactions` | Scraped transactions, including exclusion and notification timestamps |
| `bank_scripts` | Playwright scripts (versioned) |
| `bank_scrape_runs` | Scraping execution history |
| `bank_scrape_steps` | Step-level audit trail |
| `conciliation_requests` | Orders pending reconciliation, including expired and cancelled states |
| `conciliation_attempts` | Attempt history with reasons |
| `conciliated_transactions` | Confirmed matches |

## Frontend

React 19 SPA in `client/`. API routes are mounted under `/api`, and the shared Axios client uses `/api` by default with an optional `VITE_API_BASE_URL` override. The Vite dev server proxies `/api` to the backend.

- **Routing**: React Router v7
- **Server state**: TanStack Query (caching, refetch, mutations)
- **Auth**: `client/src/features/user/providers/AuthProvider.tsx` coordinates session state; token and user are persisted in `localStorage`, and `client/src/shared/http/client.ts` attaches the bearer token and redirects on `401`
- **UI**: shadcn/ui components + Tailwind CSS v4
- **i18n**: i18next with `client/src/shared/i18n/` plus per-feature namespaces in `client/src/features/*/i18n/`
- **Feature modules**: frontend code is grouped under `client/src/features/{user,dashboard,account,banking,conciliation,script-engine}/` with local APIs, hooks, pages, routes, types, and translations where needed
- **Operation mode guards**: `/conciliations` requires `reconcile`, while `/movements` requires `passthrough`
