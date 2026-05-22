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
│   │   │   └── application/                  # Account/bank/config use cases, ClearScrapeBlockUseCase (restart)
│   │   ├── banking/                          # Bank scraping, persistent sessions, movement notification
│   │   │   ├── domain/                       # BankTransaction, repo & session ports, isFatalScrapeError, scrape blocker port
│   │   │   ├── infrastructure/               # Repos, read model, SessionManager, BankSessionRepository, script & blocker adapters
│   │   │   └── application/                  # RunBankScrape, IngestTransactions, list movements, notify/re-notify use cases
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

## Persistent sessions & skip-on-fatal — key files

```text
src/contexts/banking/domain/isFatalScrapeError.ts            # Classifies fatal (no-retry) vs transient scrape errors
src/contexts/banking/domain/ports/IAccountScrapeBlocker.ts   # Port to block an account after a fatal failure
src/contexts/banking/domain/IBankSessionRepository.ts        # Port for persistent bank_sessions state
src/contexts/banking/infrastructure/SessionManager.ts        # In-process registry of live persistent monitor sessions
src/contexts/banking/infrastructure/BankSessionRepository.ts # bank_sessions running/stopped persistence
src/contexts/banking/infrastructure/adapters/AccountScrapeBlockerAdapter.ts # Sets accounts.scrape_blocked_reason
src/contexts/banking/application/RunBankScrapeUseCase.ts     # One-shot scrape; blocks account on fatal error
src/contexts/banking/application/IngestTransactionsUseCase.ts # Dedup + persist + publish (shared by one-shot and monitor)
src/contexts/account/application/ClearScrapeBlockUseCase.ts  # Clears scrape block (restart endpoint)
src/contexts/script-engine/infrastructure/runMonitor.ts      # Long-lived login/poll/keepAlive monitor loop
src/contexts/script-engine/infrastructure/PersistentPlaywrightRunner.ts # Persistent-context runner driving runMonitor
src/contexts/script-engine/infrastructure/scripts/bancopichincha/extract_transactions.v1.0.0.js # Pichincha hook script
src/shared/infrastructure/queues/schedulerQueries.ts         # Scrape-eligibility SQL (filters scrape_blocked_reason)
src/shared/infrastructure/db/migrations/028_account_config_session_settings.sql
src/shared/infrastructure/db/migrations/029_create_bank_sessions.sql
src/shared/infrastructure/db/migrations/030_seed_pichincha_script.sql
src/shared/infrastructure/db/migrations/031_accounts_scrape_blocked.sql
```
