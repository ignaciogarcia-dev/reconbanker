# Repository Map

```text
reconbanker/
├── src/                                      # Backend source
│   ├── index.ts                              # App bootstrap: server, workers, scheduler, event handlers
│   ├── api/
│   │   ├── server.ts                         # Express app, CORS, static client serving, route binding
│   │   ├── http/
│   │   │   ├── controller.ts                 # Async controller wrapper
│   │   │   └── validate.ts                   # Zod request validation helpers
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.ts            # JWT verification
│   │   │   └── error.middleware.ts           # Global error handler
│   │   └── routes/
│   │       ├── auth.routes.ts                # POST /auth/register, /auth/login
│   │       ├── user.routes.ts                # /me and operation mode
│   │       ├── accounts.routes.ts            # /accounts CRUD, config, scrape trigger
│   │       ├── bank-movements.routes.ts      # /accounts/:accountId/movements
│   │       ├── banks.routes.ts               # /banks CRUD + scripts
│   │       ├── conciliation.routes.ts        # /conciliation list, run, poll, notify
│   │       └── scripts.routes.ts             # /scripts list, detail, promote
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
│   │   │   ├── domain/                       # Account, Bank, AccountConfig, credentials, repositories
│   │   │   ├── infrastructure/               # PostgreSQL repositories and executor
│   │   │   └── application/                  # Account, bank, config, and delete use cases
│   │   ├── banking/                          # Bank scraping and movement notification context
│   │   │   ├── domain/                       # BankTransaction, scrape run, script engine port
│   │   │   ├── infrastructure/               # Repositories, read model, script adapter, executor
│   │   │   └── application/                  # Scrape, list movements, notify/re-notify use cases
│   │   ├── conciliation/                     # Reconciliation bounded context
│   │   │   ├── domain/                       # ConciliationRequest, engine, match result, repositories
│   │   │   ├── infrastructure/               # Repositories, read model, executor
│   │   │   └── application/                  # Poll, run, transaction ingestion, webhook, expiry use cases
│   │   ├── script-engine/                    # Playwright script management
│   │   │   ├── domain/                       # BankScript and repository port
│   │   │   ├── infrastructure/               # PlaywrightRunner, ScriptLoader, scripts/, repository
│   │   │   └── application/                  # List, detail, promote script use cases
│   │   └── user/                             # Authentication and user preferences
│   │       ├── domain/                       # User and repository port
│   │       ├── infrastructure/               # User repository and executor
│   │       └── application/                  # Register, login, current user, operation mode use cases
│   └── shared/
│       ├── domain/                           # Entity, AggregateRoot, ValueObject
│       ├── errors/                           # Application/domain error classes
│       ├── events/                           # Event bus abstractions and domain event types
│       ├── infrastructure/
│       │   ├── db/                           # PostgreSQL pool, migration runner, 27 SQL migrations
│       │   ├── logger/                       # Winston logger implementation
│       │   ├── queues/                       # BullMQ queues, scheduler, workers
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
│       │   ├── account/                      # Accounts, banks, account config APIs/pages/hooks
│       │   ├── banking/                      # Bank movements screen and notification APIs
│       │   ├── conciliation/                 # Conciliation list/detail actions and mode-gated route
│       │   └── script-engine/                # Script list/detail/promote UI
│       └── shared/
│           ├── http/                         # Axios client
│           ├── i18n/                         # i18next setup and common namespace
│           ├── layout/                       # Shells, sidebar/header, language selector
│           ├── lib/                          # Shared utility helpers
│           └── ui/                           # shadcn/ui primitives
├── docs/                                     # Project documentation
├── docker-compose.yml                        # PostgreSQL 16 + Redis 7
├── setup.sh                                  # One-command setup script
├── package.json                              # Backend scripts + dependencies
├── pnpm-workspace.yaml                       # Monorepo workspace config
└── .env.example                              # Environment variable template
```
