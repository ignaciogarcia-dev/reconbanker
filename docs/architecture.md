# Architecture

ReconBanker is a full-stack TypeScript monorepo built around Domain-Driven Design principles with an async job processing backbone.

## Bounded contexts

The backend is organized into five bounded contexts under `src/contexts/`:

### `account`

Manages accounts and banks.

- **Account** - links a customer to a bank, holds status
- **Bank** - defines a supported bank (code, name, login URL)
- **AccountConfig** - per-account webhook URL, polling endpoint, auth settings, and bank-session behaviour (`session_type`, `login_mode`)

### `banking`

Handles bank scraping and transaction ingestion.

- **BankTransaction** - a transaction scraped from a bank account
- **ScrapeRunRecorder** - records one execution: its stages, its outcome, and the pre-failure event trail (see [Failure diagnostics](#failure-diagnostics))
- **ScriptEnginePort** - port abstraction; `PlaywrightRunner` is the adapter (one-shot scraping)
- **SessionManager** - in-process registry of long-lived persistent monitor sessions (see [Persistent bank sessions](#persistent-bank-sessions))
- **categorizeFailure** - derives a failure category from a thrown message's prefix, which also recovers the stage a legacy script failed at

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

Hook-based scripts return `{ login, isAuthenticated, poll, keepAlive? }`; legacy scripts return a transaction array. `PersistentPlaywrightRunner` detects a hook object by checking for a `poll` function, while `PlaywrightRunner` consumes the array return. Banco Pichincha is the first hook-based, persistent bank: seeded at v1.0.0 by migration `030_seed_pichincha_script.sql`, with **v1.0.2 the active version** (seeded by `042`, promoted by `045_activate_pichincha_script_v1_0_2.sql`, code in `scripts/bancopichincha/extract_transactions.v1.0.2.js`).

Neither runner requires a script to report its own stages: the harness records them, so a script that logs nothing is still diagnosable. See [Failure diagnostics](#failure-diagnostics).

### Lifecycle

- The Scheduler's `ensurePersistentSessions` health-check (every ~75s) re-enqueues a bank-scrape job for each eligible persistent account not already running, which flows through `RunBankScrapeUseCase` → `ensureRunning` to relaunch crashed sessions.
- On `SIGTERM`, `src/index.ts` calls `sessionManager.stopAll()` before closing workers.

### Accounts that need a human

Per-account session health lives in `bank_sessions`, and only there.

- An **assisted persistent** session that ends non-cleanly — `auth_timeout`, `logged_out`, `watchdog_timeout`, or a crash — is parked in `needs_attention` by `SessionManager.handleEnd` (status added in migration `048_bank_sessions_needs_attention.sql`). It drives the dashboard light and, except for an operator-initiated kill, a Slack alert. Simple persistent accounts are stopped instead, since they can log in unattended.
- An operator clears it by `POST /accounts/:accountId/reactivate` → `ReactivateSessionUseCase`, which is ownership-checked in the route and rejects anything that is not assisted-persistent. Recovery is announced only once the session actually re-authenticates, not at launch. `KillSessionUseCase` parks an account the same way but suppresses the alarm, the operator having initiated it.
- The per-execution record in `bank_scrape_runs` deliberately does **not** duplicate this state — see [Failure diagnostics](#failure-diagnostics). Two records that could disagree about whether an account needs a human are worse than one.

> **No account-level scrape block exists.** An earlier design matched fatal failures with `isFatalScrapeError`, blocked the account through `AccountScrapeBlockerAdapter`, and gated both Scheduler queries on `accounts.scrape_blocked_reason IS NULL`. Migration `036_drop_accounts_scrape_blocked.sql` dropped those columns and the modules are gone.
>
> Note the consequence, since nothing replaced that gating: `PERSISTENT_SESSION_CANDIDATES_SQL` selects on `status = 'active'` and `session_type = 'persistent'` only, so the ~75s health-check re-enqueues a parked assisted account and `ensureRunning` relaunches it — re-submitting credentials roughly every auth-timeout window. `needs_attention` today is an alerting and dashboard state, not a gate.

## Domain event bus

An in-memory pub/sub bus (`EventBus`) connects contexts without direct coupling:

| Event | Published by | Handled by |
|---|---|---|
| `AccountCreated` | `CreateAccountUseCase` | - |
| `TransactionIngested` | `RunBankScrapeUseCase` | Runs transaction ingestion handling and enqueues bank movement webhook notification |
| `ConciliationMatched` | `RunConciliationUseCase` | Enqueues webhook notification |
| `ConciliationFailed` | `RunConciliationUseCase` | - |
| `ConciliationExpired` | `ExpireStaleRequestsUseCase` | - |
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
| `account_config` | Per-account webhook, polling, expiry-notification, extra-field, silent-ingestion, and bank-session (`session_type`, `login_mode`) config |
| `bank_sessions` | Latest state of each account's persistent monitor session (`running`/`stopped`/`needs_attention` + `stop_reason`) |
| `bank_credentials` | Encrypted login credentials per account |
| `bank_transactions` | Scraped transactions, including exclusion and notification timestamps |
| `bank_scripts` | Playwright scripts (versioned) |
| `bank_scrape_runs` | One row per script execution — a one-shot scrape, or a whole persistent session lifetime — with its outcome, `stop_reason`, `failure_type` and duration |
| `bank_scrape_steps` | The stages of a run: which ran, which is still in progress, and which failed, with the stack and the URL at the point of failure |
| `conciliation_requests` | Orders pending reconciliation, including expired and cancelled states |
| `conciliation_attempts` | Attempt history with reasons |
| `conciliated_transactions` | Confirmed matches |

## Failure diagnostics

When a bank script fails — by throwing, or by hanging until a timeout cuts it off — the
system records enough to diagnose it without reproducing it. Two audiences: an engineer at a
`psql` prompt or a log file, and a future agent that reads a failure and proposes a fix.

The amount captured does **not** depend on what the script author remembered to log. The
harness records the checkpoints, so a script that emits nothing is still diagnosable; a
script's own events add detail on top.

### Stage vocabulary

`bank_scrape_steps.step` is a closed set of eleven values, constrained by the database and
emitted only by the harness. Script event names stay free-form and never reach this column —
requiring authors to adopt a taxonomy is the same dependency on author diligence that the
automatic baseline exists to remove.

| Stage | Where it comes from |
|---|---|
| `launch` | Browser launch and page setup, both runners |
| `load_script` | Evaluating the script body; for a hook script, checking it returned a `poll()` |
| `credentials` | Resolving and decrypting the account's login credentials |
| `login` | `hooks.login`, or a `login_failed:` prefix from a legacy script |
| `auth_wait` | Waiting for authentication. Opened on entry and closed on exit only — an assisted login polls up to 200 times |
| `poll` | A poll cycle of a persistent monitor, including its liveness check |
| `keep_alive` | The optional `keepAlive` hook |
| `navigate`, `movements_fetch`, `detail_extraction` | Inside a legacy one-shot script, derived at failure time from the category prefix the script throws |
| `close` | Browser close, one-shot runner |

The harness cannot see inside a legacy script's single opaque call, so those three in-script
stages are recovered from the existing convention whereby a script encodes its category as
the prefix of the thrown message. This needs no script edits — which matters, because
editing a published script means a new version, a republish, and a promotion.

**Rows are written for failures and transitions only.** A steady-state poll writes nothing:
an eight-hour session at a 60-second interval would otherwise leave ~480 rows, nearly all of
them "nothing new". The once-per-session stages write a `started` row and update it on exit,
so a hang in any of them is visible as a row that never closed.

### Stop reason to run status

Run status stays three-valued so it remains a clean answer to "did this work". The nuance
lives in `stop_reason`, mirroring `bank_sessions`.

| Monitor outcome | `status` | `stop_reason` | `failure_type` |
|---|---|---|---|
| `stop_requested` (operator, SIGTERM) | `success` | `stop_requested` | — |
| `max_runtime` | `success` | `max_runtime` | — |
| `auth_timeout` / `logged_out` / `watchdog_timeout` | `failed` | same | same |
| `browser_closed` / `session_killed` | `failed` | same | same |
| harness failure before the script ran | `failed` | — | `launch_failed` / `script_load_failed` / `credentials_failed` |
| unrecognised crash | `failed` | — | derived from the thrown message |
| process died mid-run | `failed` | — | `orphaned` |

A clean stop is a success, so restarts and shutdowns stay out of the failure list. In-flight
runs are reconciled to `orphaned` **at boot only**: sessions live in an in-process registry,
so a restart genuinely invalidates every `running` row. Age proves nothing for a session that
legitimately runs for days.

Old runs are pruned on the scheduler's interval (`SCRAPE_RUN_RETENTION_DAYS`, default 90);
step rows follow via `ON DELETE CASCADE`.

### Where it lands

Failures are recorded in two places that already existed: the **database**, for structured
records you can search, and the **log files**, for the full pre-failure event trail. The
run's own id (`bank_scrape_runs.id`) is the only identifier tying them together — no separate
tracking number is issued, and it is stamped on every line a script emits.

The trail is a bounded in-memory buffer — a pinned head plus a rolling tail, so the login
phase survives hours of polling — flushed as **one** `error` entry when a run fails and
discarded when it succeeds. It lives in the log files rather than a column because it carries
counterparty names and account numbers: a rotating exposure beats a permanent one. A hard
crash loses it, and boot reconciliation can then report only that the run was orphaned.

Not captured, deliberately: screenshots and page content. Only the URL at the point of
failure is kept.

### Reading a failure

Querying directly is the intended access method: there is no API endpoint and no UI. The
`pnpm failures` CLI wraps the two common questions.

```bash
# Which runs failed? Filter by account, time window, and failing stage.
pnpm failures
pnpm failures --account=<uuid> --since=7d --stage=login --limit=50

# What happened in this one? Prints the run, its stages in order, and its event trail.
pnpm failures --run=<uuid>
```

The detail view retrieves the trail from `logs/error-*.log` itself, and prints the
equivalent `grep`/`jq` command so the database-to-log-file link is explicit rather than
folklore. A trail older than the 14-day log rotation is gone; the run and step rows remain.

### Canonical queries

These are what the CLI runs. All were checked with `EXPLAIN (ANALYZE)` against a seeded
20k-run table — none falls back to a sequential scan on either failure table.

```sql
-- Recent failures, most recent first.        -> idx_bank_scrape_runs_failed
SELECT r.started_at, r.duration_ms, r.account_id, r.failure_type, r.stop_reason, r.id
  FROM bank_scrape_runs r
 WHERE r.status = 'failed'
 ORDER BY r.started_at DESC
 LIMIT 20;

-- Every run that failed at the login step.   -> + idx_bank_scrape_steps_failed
SELECT r.started_at, r.account_id, r.failure_type, r.id
  FROM bank_scrape_runs r
 WHERE r.status = 'failed'
   AND EXISTS (SELECT 1 FROM bank_scrape_steps st
                WHERE st.run_id = r.id AND st.status = 'failed' AND st.step = 'login')
 ORDER BY r.started_at DESC
 LIMIT 20;

-- One run's stages, in the order they happened.   -> idx_bank_scrape_steps_run
SELECT step_index, step, status, failure_type, duration_ms, url, error_message
  FROM bank_scrape_steps
 WHERE run_id = '<uuid>'
 ORDER BY step_index;

-- Which stage fails most often, over the last week.
SELECT step, count(*) AS failures
  FROM bank_scrape_steps
 WHERE status = 'failed' AND created_at > now() - interval '7 days'
 GROUP BY step
 ORDER BY failures DESC;

-- Runs still in progress. Outside a live session these are orphans awaiting the next
-- boot reconciliation, which closes them as failure_type='orphaned'.
SELECT id, account_id, started_at FROM bank_scrape_runs WHERE status = 'running';
```

Use an EXISTS rather than a join for the stage filter: a join returns one row per matching
step, so it needs a `DISTINCT` that costs the ordering, and the planner leads with the runs
table either way.

The trail itself is not in the database — retrieve it by run id:

```bash
grep -h '<run-uuid>' logs/error-*.log | jq 'select(.message=="failure_trail") | .trail'
```

## Frontend

React 19 SPA in `client/`. API routes are mounted under `/api`, and the shared Axios client uses `/api` by default with an optional `VITE_API_BASE_URL` override. The Vite dev server proxies `/api` to the backend.

- **Routing**: React Router v7
- **Server state**: TanStack Query (caching, refetch, mutations)
- **Auth**: `client/src/features/user/providers/AuthProvider.tsx` coordinates session state; token and user are persisted in `localStorage`, and `client/src/shared/http/client.ts` attaches the bearer token and redirects on `401`
- **UI**: shadcn/ui components + Tailwind CSS v4
- **i18n**: i18next with `client/src/shared/i18n/` plus per-feature namespaces in `client/src/features/*/i18n/`
- **Feature modules**: frontend code is grouped under `client/src/features/{user,dashboard,account,banking,conciliation,script-engine}/` with local APIs, hooks, pages, routes, types, and translations where needed
- **Operation mode guards**: `/conciliations` requires `reconcile`, while `/movements` requires `passthrough`
