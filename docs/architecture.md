# Architecture

ReconBanker is a full-stack TypeScript monorepo built around Domain-Driven Design principles with an async job processing backbone.

## Bounded contexts

The backend is organized into five bounded contexts under `src/contexts/`:

### `account`

Manages accounts and banks.

- **Account** - links a customer to a bank, holds status and a fatal-block state (`scrape_blocked_at` / `scrape_blocked_reason`)
- **Bank** - defines a supported bank (code, name, login URL)
- **AccountConfig** - per-account webhook URL, polling endpoint, auth settings, and bank-session behaviour (`session_type`, `login_mode`)
- `ClearScrapeBlockUseCase` - clears an account's fatal block (ownership-checked) so automatic triggers resume

### `banking`

Handles bank scraping and transaction ingestion.

- **BankTransaction** - a transaction scraped from a bank account
- **ScrapeRun / ScrapeStep** - audit trail of each scraping execution
- **ScriptEnginePort** - port abstraction; `PlaywrightRunner` is the adapter (one-shot scraping)
- **SessionManager** - in-process registry of long-lived persistent monitor sessions (see [Persistent bank sessions](#persistent-bank-sessions))
- **isFatalScrapeError** - classifies a failure message as fatal (e.g. bad credentials) so it is never auto-retried; drives the skip-on-fatal block

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
- Supported banks: Mi Dinero (one-shot), Banco Pichincha Empresas (persistent)
- Two script contracts coexist (see [Persistent bank sessions](#persistent-bank-sessions)): legacy scripts return a transaction array and run under `PlaywrightRunner`; hook-based scripts return a `{ login, isAuthenticated, poll, keepAlive }` object and run under `PersistentPlaywrightRunner` + `runMonitor`

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

The Scheduler (`src/shared/infrastructure/queues/Scheduler.ts`) enqueues recurring polling, scraping, persistent-session health-check, and stale-request expiry jobs based on `POLLING_INTERVAL_SECONDS`, `SCRAPE_INTERVAL_SECONDS`, `SESSION_HEALTHCHECK_SECONDS` (default 75s), and `EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS`.

## Persistent bank sessions

Each account chooses how its bank is scraped via two `account_config` columns added in migration `028_account_config_session_settings.sql` (read by `AccountForBankingReaderAdapter`, defaulting to `one-shot`/`simple` when no config row exists):

- `session_type`: `one-shot` (open → scrape → close, periodic) or `persistent` (a long-lived browser monitor)
- `login_mode`: `simple` (logs in unattended) or `assisted` (waits for a human to complete 2FA)

### Routing

`RunBankScrapeUseCase` branches on `session_type`. For `persistent` accounts it delegates to `SessionManager.ensureRunning(accountId)` and returns; for `one-shot` accounts it runs the legacy load-script → run → ingest path.

### Persistent runtime

- **SessionManager** (`src/contexts/banking/infrastructure/SessionManager.ts`) is an in-process registry of live sessions keyed by `accountId`. `ensureRunning` is idempotent — a no-op when a session is already live or currently starting. A `starting` map closes the TOCTOU window between the live-check and `live.set` so a concurrent call never launches a second browser against the same profile (Chromium cannot share a `userDataDir`). When a session's `done` promise settles, the slot is freed and `bank_sessions` is updated; a fatal stop reason additionally blocks the account (best-effort). `stopAll()` stops every live session.
- **runMonitor** (`src/contexts/script-engine/infrastructure/runMonitor.ts`) drives a hook-based script: it calls `login`, polls `isAuthenticated` until an auth deadline (assisted ~300s, simple ~30s, returning `auth_timeout` on expiry), then loops calling `poll`. Dedup is seeded with `lastExternalId` and cleared on a bank-day rollover (via `getBankDay`), since `poll` only returns "today". It detects a lost session (`isAuthenticated` false → `logged_out`), honours `shouldStop` (`stop_requested`) and `maxRuntimeMs` (`max_runtime`), and invokes the optional `keepAlive` hook when a poll yields nothing or fails.
- **PersistentPlaywrightRunner** (`src/contexts/script-engine/infrastructure/PersistentPlaywrightRunner.ts`) launches `chromium.launchPersistentContext` with a per-account profile under `playwright-profiles/<accountId>` and `headless: false`, evaluates the script body, and requires the returned object to expose a `poll()` function (otherwise it rejects). It wires the hooks into `runMonitor` and closes the context when the monitor exits.
- The composition root (`src/composition/bankingModule.ts`) builds the `startFn` that loads credentials and the active script, computes `lastExternalId`, and starts the runner; `getBankDay` uses the `America/Guayaquil` timezone for Pichincha.
- **bank_sessions** (migration `029_create_bank_sessions.sql`) holds one row per account (`running`/`stopped` + `stop_reason`), upserted by `BankSessionRepository`.

### Script contract

Hook-based scripts return `{ login, isAuthenticated, poll, keepAlive? }`; legacy scripts return a transaction array. `PersistentPlaywrightRunner` detects a hook object by checking for a `poll` function, while `PlaywrightRunner` consumes the array return. Banco Pichincha (seeded by migration `030_seed_pichincha_script.sql`, code in `scripts/bancopichincha/extract_transactions.v1.0.0.js`) is the first hook-based, persistent bank.

### Lifecycle

- The Scheduler's `ensurePersistentSessions` health-check (every ~75s) re-enqueues a bank-scrape job for each eligible persistent account not already running, which flows through `RunBankScrapeUseCase` → `ensureRunning` to relaunch crashed sessions.
- On `SIGTERM`, `src/index.ts` calls `sessionManager.stopAll()` before closing workers.

### Skip-on-fatal and restart

A fatal failure (matched by `isFatalScrapeError` in `src/contexts/banking/domain/isFatalScrapeError.ts`, e.g. `login_failed` or "No valid credentials") must never be auto-retried, as repeated bad logins risk a bank lockout.

- When a one-shot scrape or a persistent session fails fatally, the account is blocked via `AccountScrapeBlockerAdapter`, which sets `scrape_blocked_at` / `scrape_blocked_reason` (columns from migration `031_accounts_scrape_blocked.sql`). The write is idempotent — only the first (root-cause) reason is recorded.
- Both Scheduler queries (`schedulerQueries.ts`) gate on `scrape_blocked_reason IS NULL`, so blocked accounts are excluded from one-shot scraping and persistent-session relaunch alike.
- An operator clears the block via `POST /accounts/:id/restart`, which runs `ClearScrapeBlockUseCase` (ownership-checked) and re-enqueues a scrape. Works for both one-shot and persistent accounts.

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
| `accounts` | Customer bank accounts, including fatal scrape-block state (`scrape_blocked_at`, `scrape_blocked_reason`) |
| `account_config` | Per-account webhook, polling, expiry-notification, extra-field, silent-ingestion, and bank-session (`session_type`, `login_mode`) config |
| `bank_sessions` | Latest state of each account's persistent monitor session (`running`/`stopped`) |
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
