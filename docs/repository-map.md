# Repository Map

```text
reconbanker/
├── src/                                      # Backend source
│   ├── index.ts                              # App bootstrap: server, workers, scheduler, sessions, event handlers
│   ├── api/
│   │   ├── server.ts                         # Express app, CORS, static client serving, route binding
│   │   ├── http/
│   │   │   ├── controller.ts                 # Async controller wrapper
│   │   │   └── validate.ts                   # Zod request validation helpers
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.ts            # JWT verification
│   │   │   └── error.middleware.ts           # Global error handler
│   │   └── routes/
│   │       ├── auth.routes.ts                # POST /api/auth/register, /api/auth/login
│   │       ├── user.routes.ts                # /api/me and operation mode
│   │       ├── accounts.routes.ts            # /api/accounts CRUD, config, scrape trigger, scrape-block restart
│   │       ├── bank-movements.routes.ts      # /api/accounts/:accountId/movements
│   │       ├── banks.routes.ts               # /api/banks CRUD + scripts
│   │       ├── conciliation.routes.ts        # /api/conciliation list, run, poll, notify
│   │       └── scripts.routes.ts             # /api/scripts list, detail, promote
│   ├── composition/
│   │   ├── container.ts                      # Dependency graph and module factory
│   │   ├── bindRoutes.ts                     # Express route composition
│   │   ├── accountModule.ts
│   │   ├── bankingModule.ts
│   │   ├── conciliationModule.ts
│   │   ├── scriptEngineModule.ts
│   │   └── userModule.ts
│   ├── contexts/
│   │   ├── account/                          # Account & Bank bounded context
│   │   │   ├── domain/                       # Account, Bank, AccountConfig, credentials, repository ports
│   │   │   ├── infrastructure/               # PostgreSQL repositories, mappers, executor, reader adapters
│   │   │   └── application/                  # Account/bank/config use cases
│   │   ├── banking/                          # Bank scraping, persistent sessions, movement notification
│   │   │   ├── domain/                       # BankTransaction, repo & session ports, failure categories & stage vocabulary
│   │   │   ├── infrastructure/               # Repos, read models, SessionManager, BankSessionRepository, script adapter
│   │   │   └── application/                  # RunBankScrape, IngestTransactions, ScrapeRunRecorder, session lifecycle, notify use cases
│   │   ├── conciliation/                     # Reconciliation bounded context
│   │   │   ├── domain/                       # ConciliationRequest, engine, match result, rules/heuristics, repositories
│   │   │   ├── infrastructure/               # Repositories, read model, executor, reader adapters
│   │   │   └── application/                  # Poll, run, transaction ingestion, webhook, expiry use cases
│   │   ├── script-engine/                    # Playwright script management and execution
│   │   │   ├── domain/                       # BankScript and repository port
│   │   │   ├── infrastructure/               # PlaywrightRunner, PersistentPlaywrightRunner, runMonitor, ScriptLoader, scripts/, repo
│   │   │   └── application/                  # List, detail, promote script use cases
│   │   └── user/                             # Authentication and user preferences
│   │       ├── domain/                       # User and repository/hasher/token/cleaner ports
│   │       ├── infrastructure/               # User repository, executor, bcrypt/JWT/cleaner adapters
│   │       └── application/                  # Register, login, current user, operation mode use cases
│   └── shared/
│       ├── domain/                           # Entity, AggregateRoot, ValueObject
│       ├── errors/                           # Application/domain error classes
│       ├── events/                           # Event bus abstractions and domain event types
│       ├── infrastructure/
│       │   ├── db/                           # PostgreSQL pool, migration runner, 31 SQL migrations
│       │   ├── logger/                       # Winston logger implementation
│       │   ├── queues/                       # BullMQ queues, Scheduler, schedulerQueries (scrape-gating SQL), workers
│       │   └── webhooks/                     # Webhook sender
│       ├── logger/                           # Logger port
│       └── persistence/                      # Unit of work and transaction helpers
├── client/                                   # Frontend (React + Vite)
│   └── src/
│       ├── App.tsx                           # Provider and route composition
│       ├── main.tsx                          # React entry point
│       ├── index.css                         # Global Tailwind styles
│       ├── features/
│       │   ├── user/                         # Login, register, auth provider, user settings, mode guard
│       │   ├── dashboard/                    # Dashboard screen and i18n namespace
│       │   ├── account/                      # Accounts/banks pages, config + session-settings form, scrape-block restart button/badge, APIs/hooks
│       │   ├── banking/                      # Bank movements screen and notification APIs
│       │   ├── conciliation/                 # Conciliation list/detail actions and mode-gated route
│       │   └── script-engine/                # Script list/detail/promote UI
│       └── shared/
│           ├── hooks/                        # Shared React hooks (e.g. use-mobile)
│           ├── http/                         # Axios client
│           ├── i18n/                         # i18next setup and common namespace
│           ├── layout/                       # Shells, sidebar/header, language selector
│           ├── lib/                          # Shared utility helpers
│           └── ui/                           # shadcn/ui primitives
├── tests/                                    # Backend tests (unit colocated in src/; integration + smoke here)
│   ├── helpers/                              # In-memory repository/UoW fakes for unit tests
│   ├── integration/                          # DB-backed integration tests (account, banking, conciliation, script-engine, shared, user)
│   └── smoke/                                # Server-boot smoke test
├── docs/                                     # Project documentation
├── docker-compose.yml                        # PostgreSQL 16 + Redis 7
├── setup.sh                                  # One-command setup script
├── package.json                              # Backend scripts + dependencies
├── pnpm-workspace.yaml                       # Monorepo workspace config
└── .env.example                              # Environment variable template
```

## Persistent sessions — key files

```text
src/contexts/banking/domain/IBankSessionRepository.ts        # Port for persistent bank_sessions state
src/contexts/banking/infrastructure/SessionManager.ts        # In-process registry of live persistent monitor sessions
src/contexts/banking/infrastructure/BankSessionRepository.ts # bank_sessions running/stopped/needs_attention persistence
src/contexts/banking/application/RecordedSessionLauncher.ts  # Opens/closes the run record for a session lifetime
src/contexts/banking/application/RunBankScrapeUseCase.ts     # One-shot scrape; delegates persistent accounts to SessionManager
src/contexts/banking/application/IngestTransactionsUseCase.ts # Dedup + persist + publish (shared by one-shot and monitor)
src/contexts/banking/application/ReactivateSessionUseCase.ts # Manual relaunch of a session parked in needs_attention
src/contexts/banking/application/KillSessionUseCase.ts       # Force-terminates a live session's browser
src/contexts/script-engine/infrastructure/runMonitor.ts      # Long-lived login/poll/keepAlive monitor loop
src/contexts/script-engine/infrastructure/PersistentPlaywrightRunner.ts # Persistent-context runner driving runMonitor
src/contexts/script-engine/infrastructure/scripts/bancopichincha/extract_transactions.v1.0.2.js # Pichincha hook script (active)
src/shared/infrastructure/queues/schedulerQueries.ts         # Scrape-eligibility SQL (active + session_type)
src/shared/infrastructure/db/migrations/028_account_config_session_settings.sql
src/shared/infrastructure/db/migrations/029_create_bank_sessions.sql
src/shared/infrastructure/db/migrations/030_seed_pichincha_script.sql
src/shared/infrastructure/db/migrations/048_bank_sessions_needs_attention.sql
```

## Failure diagnostics — key files

```text
src/shared/domain/scrapeStage.ts                             # The eleven-stage vocabulary + the harness-facing recorder port
src/shared/domain/failureTrail.ts                            # Trail ports and the shared log-line size limit
src/contexts/banking/application/ScrapeRunRecorder.ts        # Records one execution: stages, outcome, trail flush
src/contexts/banking/application/TrailBuffer.ts              # Pinned head + rolling tail of pre-failure events
src/contexts/banking/domain/scrapeFailure.ts                 # Failure categories parsed from a thrown message prefix
src/contexts/banking/domain/scrapeStage.ts                   # Category-to-stage derivation for legacy scripts
src/contexts/banking/domain/monitorStopOutcome.ts            # Monitor stop reason -> run status / category
src/contexts/banking/infrastructure/ScrapeRunRepository.ts   # bank_scrape_runs writes, orphan reconciliation, pruning
src/contexts/banking/infrastructure/ScrapeStepRepository.ts  # bank_scrape_steps writes
src/contexts/banking/infrastructure/ScrapeFailureReadModel.ts # Read side behind the failures CLI
src/contexts/script-engine/infrastructure/debugLogSink.ts    # Parses/redacts script log lines and fills the trail
src/shared/infrastructure/cli/failures.ts                    # `pnpm failures` list + detail
src/shared/infrastructure/db/migrations/052_scrape_step_diagnostics.sql
```
