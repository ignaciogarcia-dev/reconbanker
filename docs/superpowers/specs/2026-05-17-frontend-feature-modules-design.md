# Frontend feature modules — design

## Context

El frontend (`client/`) es un monolito plano: 8 páginas en `pages/`, cada una llama a `axios` directo, redefine tipos (`Account` aparece 5 veces, `BankMovement` 2 veces), y mezcla HTTP, presentación y estado en un solo archivo. `lib/` mezcla auth, hooks, utilities y http en cuatro archivos. `i18n/` es un único JSON gigante por idioma. La capa shadcn/ui está bien delimitada pero la convive con componentes custom esparcidos.

El backend acaba de migrarse a DDD con cinco bounded contexts (`account`, `banking`, `conciliation`, `user`, `script-engine`). El frontend no espeja esa organización, lo que dificulta navegar el código y razonar sobre features completas.

Este refactor reorganiza `client/src/` por **feature modules** alineados con los bounded contexts del backend, agrega una capa `shared/` para lo transversal, extrae los tipos del backend al mapearlos a camelCase en una capa `api/` por feature, parte el i18n en namespaces por feature, e introduce tests unit con Vitest + React Testing Library + MSW.

Prioridad declarada por el dueño del proyecto: **prolijidad sobre compatibilidad con prod legacy**. Nada de shims, re-exports legacy, ni archivos transitorios. Si un patrón pide romper un detalle interno, se rompe. (Los contratos HTTP con el backend no cambian — el refactor es interno al cliente.)

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Estructura | 5 features espejando bounded contexts (`user`, `account`, `banking`, `conciliation`, `script-engine`) + `dashboard` cross-cutting |
| Estructura interna por feature | `pages/`, `components/`, `api/`, `types/`, `hooks/`, `i18n/`, `routes.tsx` |
| Capa shared | `shared/http/`, `shared/i18n/`, `shared/ui/` (shadcn), `shared/layout/`, `shared/hooks/`, `shared/lib/` |
| Tipos | Definidos por feature en `features/X/types/`. Cuando un feature consume tipos de otro, los importa directo (sin pasar por `shared/types/`) |
| HTTP | `shared/http/client.ts` queda con el singleton axios + interceptors. Cada feature tiene `api/<resource>.ts` con funciones tipadas que llaman a ese client |
| Mapeo snake↔camel | En la capa `api/` de cada feature. Mappers `toX`/`toBackendBody` privados del módulo. Páginas y hooks reciben siempre camelCase |
| Routing | Cada feature exporta `routes.tsx` con `<Route>` o un array de rutas. `App.tsx` compone los routes en una estructura con `PublicShell` (sin auth, para login/register) y `ProtectedShell` (envuelve `AppLayout`, todas las rutas internas) |
| i18n | i18next con namespaces. Cada feature tiene `i18n/{es,en}.json` y `i18n/index.ts` que exporta `<feature>Es`/`<feature>En`. `shared/i18n/index.ts` registra los namespaces de los seis features + uno `common` (nav, enums, mascot, errores) |
| Tests | Vitest + React Testing Library + MSW. Cobertura: hooks críticos, mappers de `api/`, un smoke por feature renderizando la página principal |
| Estrategia de migración | Cambio directo, en una sola tanda de commits. No strangler ni feature flag |
| Auth ubicación | `auth.tsx` y `useUser.ts` se mueven a `features/user/` (provider, hooks, types) |
| Settings dialog | El dialog que hoy AppLayout importa como página se vuelve un componente: `features/user/components/SettingsDialog.tsx` |

## Estructura de carpetas

```
client/src/
├── features/
│   ├── user/
│   │   ├── pages/        Login.tsx, Register.tsx
│   │   ├── components/   SettingsDialog.tsx, ModeSelectDialog.tsx, ModeOptionCards.tsx
│   │   ├── api/          auth.ts, me.ts
│   │   ├── providers/    AuthProvider.tsx
│   │   ├── hooks/        useAuth.ts, useUser.ts, useSetOperationMode.ts
│   │   ├── types/        index.ts
│   │   ├── i18n/         es.json, en.json, index.ts
│   │   └── routes.tsx    rutas públicas (Login, Register)
│   ├── account/
│   │   ├── pages/        Accounts.tsx, AccountConfig.tsx, Banks.tsx
│   │   ├── api/          accounts.ts, banks.ts, accountConfig.ts
│   │   ├── hooks/        useAccounts.ts, useBanks.ts, useAccountConfig.ts
│   │   ├── types/        index.ts (Account, Bank, AccountConfig, ...)
│   │   ├── i18n/         es.json, en.json, index.ts
│   │   └── routes.tsx
│   ├── banking/
│   │   ├── pages/        BankMovements.tsx
│   │   ├── api/          movements.ts
│   │   ├── hooks/        useBankMovements.ts, useReNotifyMovement.ts
│   │   ├── types/        index.ts (BankMovement)
│   │   ├── i18n/         es.json, en.json, index.ts
│   │   └── routes.tsx
│   ├── conciliation/
│   │   ├── pages/        Conciliations.tsx
│   │   ├── api/          conciliations.ts
│   │   ├── hooks/        useConciliations.ts, useNotifyConciliation.ts
│   │   ├── types/        index.ts (ConciliationRequest, ConciliationAttempt, ConciliationMatch)
│   │   ├── i18n/         es.json, en.json, index.ts
│   │   └── routes.tsx
│   ├── script-engine/
│   │   ├── pages/        Scripts.tsx
│   │   ├── api/          scripts.ts
│   │   ├── hooks/        useScripts.ts, usePromoteScript.ts
│   │   ├── types/        index.ts (Script)
│   │   ├── i18n/         es.json, en.json, index.ts
│   │   └── routes.tsx
│   └── dashboard/
│       ├── pages/        Dashboard.tsx
│       ├── components/   widgets/* (cards de stats, gráficos)
│       ├── i18n/         es.json, en.json, index.ts
│       └── routes.tsx
├── shared/
│   ├── http/
│   │   └── client.ts     axios singleton + interceptors (request: Bearer, response: 401→logout)
│   ├── i18n/
│   │   ├── index.ts      init i18next, registra namespaces de features + common
│   │   ├── es.json       common (nav, enums, mascot, errors)
│   │   └── en.json       common
│   ├── ui/               shadcn components (button, card, table, dialog, ...)
│   ├── layout/
│   │   ├── AppLayout.tsx (sin Settings embebido)
│   │   ├── PublicShell.tsx
│   │   ├── ProtectedShell.tsx
│   │   └── LanguageSelector.tsx
│   ├── hooks/
│   │   └── use-mobile.ts
│   └── lib/
│       └── utils.ts      cn()
├── App.tsx               compone routes + providers
└── main.tsx
```

## Capa `api/` por feature

Cada feature tiene un archivo `api/<resource>.ts` con funciones async tipadas. Cero axios fuera de `api/`. Cero snake_case fuera de `api/`.

```ts
// features/account/api/accounts.ts
import { httpClient } from '@/shared/http/client'
import type { Account, CreateAccountInput, AccountDetail } from '../types'

interface AccountRow { id: string; bank: string; name: string | null; status: string }

export async function listAccounts(): Promise<Account[]> {
  const { data } = await httpClient.get<AccountRow[]>('/accounts')
  return data.map(toAccount)
}

export async function createAccount(input: CreateAccountInput): Promise<{ id: string }> {
  const { data } = await httpClient.post<{ id: string }>('/accounts', input)
  return data
}

function toAccount(row: AccountRow): Account {
  return { id: row.id, bank: row.bank, name: row.name, status: row.status as Account['status'] }
}
```

Mappers privados (`toAccount`, `toAccountConfig`, etc.) no se exportan. La página/hook consume `Account`, no `AccountRow`.

## Hooks por feature

Cada hook envuelve la función `api/` correspondiente con TanStack Query, exporta el resultado tipado y centraliza la invalidación de queries.

```ts
// features/account/hooks/useAccounts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAccounts, createAccount } from '../api/accounts'

export const accountsQueryKey = ['accounts'] as const

export function useAccounts() {
  return useQuery({ queryKey: accountsQueryKey, queryFn: listAccounts })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQueryKey }),
  })
}
```

Las `queryKey` se exportan para que otros features que necesiten invalidar (ej. `useSetOperationMode` invalida accounts, conciliations, movements) las importen tipadas:

```ts
// features/user/hooks/useSetOperationMode.ts
import { accountsQueryKey } from '@/features/account/hooks/useAccounts'
import { conciliationsQueryKey } from '@/features/conciliation/hooks/useConciliations'
import { bankMovementsQueryKey } from '@/features/banking/hooks/useBankMovements'

qc.invalidateQueries({ queryKey: accountsQueryKey })
qc.invalidateQueries({ queryKey: conciliationsQueryKey })
qc.invalidateQueries({ queryKey: bankMovementsQueryKey })
```

## Routing

Cada feature exporta un fragmento de rutas. `App.tsx` las compone con dos shells.

```tsx
// features/account/routes.tsx
import { Route } from 'react-router-dom'
import { Accounts } from './pages/Accounts'
import { AccountConfig } from './pages/AccountConfig'
import { Banks } from './pages/Banks'

export const accountRoutes = (
  <>
    <Route path="/accounts" element={<Accounts />} />
    <Route path="/accounts/:accountId/config" element={<AccountConfig />} />
    <Route path="/banks" element={<Banks />} />
  </>
)
```

```tsx
// App.tsx
<BrowserRouter>
  <AuthProvider>
    <Routes>
      <Route element={<PublicShell />}>{userPublicRoutes}</Route>
      <Route element={<ProtectedShell />}>
        {dashboardRoutes}
        {accountRoutes}
        {bankingRoutes}
        {conciliationRoutes}
        {scriptEngineRoutes}
      </Route>
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

- `PublicShell` — `<Outlet />` minimal (sin sidebar, sin guard).
- `ProtectedShell` — guard de auth (`useAuth().user` o redirect a `/login`) + `<AppLayout><Outlet /></AppLayout>`.

Las URLs públicas (`/login`, `/register`) y privadas no cambian. El usuario no nota nada.

## i18n por namespace

```ts
// shared/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { commonEs, commonEn } from './resources'
import { userEs, userEn } from '@/features/user/i18n'
import { accountEs, accountEn } from '@/features/account/i18n'
import { bankingEs, bankingEn } from '@/features/banking/i18n'
import { conciliationEs, conciliationEn } from '@/features/conciliation/i18n'
import { scriptEngineEs, scriptEngineEn } from '@/features/script-engine/i18n'
import { dashboardEs, dashboardEn } from '@/features/dashboard/i18n'

i18n.use(initReactI18next).init({
  resources: {
    es: { common: commonEs, user: userEs, account: accountEs, banking: bankingEs,
          conciliation: conciliationEs, 'script-engine': scriptEngineEs, dashboard: dashboardEs },
    en: { common: commonEn, user: userEn, account: accountEn, banking: bankingEn,
          conciliation: conciliationEn, 'script-engine': scriptEngineEn, dashboard: dashboardEn },
  },
  fallbackLng: 'es',
  defaultNS: 'common',
})
```

Uso:
```tsx
const { t } = useTranslation('account')
t('list.title')

const { t: tNav } = useTranslation('common')
tNav('nav.accounts')
```

Mapeo del JSON actual a namespaces:
- `nav.*`, `enums.*`, `mascot.*`, errores → `common`
- `login.*`, `register.*`, `settings.*` → `user`
- `accounts.*`, `banks.*`, `accountConfig.*` → `account`
- `movements.*` → `banking`
- `conciliations.*` → `conciliation`
- `scripts.*` → `script-engine`
- `dashboard.*` → `dashboard`

## Tests

Setup en `client/`:
- Devdeps: `vitest`, `@vitest/coverage-v8`, `@vitest/ui`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `msw`.
- `client/vitest.config.ts` con `environment: 'jsdom'`, `alias: { '@': './src' }`, `setupFiles: ['tests/setup.ts']`.
- `client/tests/setup.ts` importa `@testing-library/jest-dom` y registra MSW server `beforeAll`/`afterAll`/`afterEach`.
- Script en `client/package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.

Qué se testea (mínimo defendible, no cobertura total):

1. **Hooks críticos** (1 archivo por hook):
   - `features/user/hooks/useAuth.test.ts` — login persiste token+user, logout limpia, useAuth fuera de provider tira.
   - `features/user/hooks/useUser.test.ts` — query a `/me`, mapeo `operation_mode → operationMode`.
   - `features/account/hooks/useAccounts.test.ts` — useAccounts mapea snake→camel, useCreateAccount invalida la query.

2. **Mappers de `api/`** (puros, sin red):
   - `features/account/api/accountConfig.test.ts` — round-trip snake↔camel preserva todo, parsea `webhook_extra_fields` string JSON, conserva `silent_ingestion: false` default.

3. **Smoke por feature** (1 test por página principal con MSW):
   - Renderiza la página, MSW intercepta sus llamadas, verifica que aparecen los datos esperados y que un evento (click "crear", click "promote") dispara el POST correcto.
   - Páginas cubiertas: Accounts, BankMovements, Conciliations, Scripts.

MSW handlers en `tests/msw/`:
```
tests/msw/
├── server.ts          setupServer + reset between tests
└── handlers/
    ├── user.ts        auth, /me
    ├── account.ts     /accounts, /banks
    ├── banking.ts     /accounts/:id/movements
    ├── conciliation.ts
    └── scriptEngine.ts
```

Cada test importa solo los handlers que necesita: `server.use(...accountHandlers)`.

## Verificación end-to-end

Antes de mergear:

| Check | Comando | Resultado esperado |
|---|---|---|
| Backend typecheck | `pnpm typecheck` | OK |
| Backend unit | `pnpm test` | 102/102 ✓ |
| Backend integration | `pnpm test:integration` | 131/131 ✓ |
| Client lint | `cd client && pnpm lint` | 0 errors |
| Client typecheck | `cd client && tsc -b --noEmit` | OK |
| Client build | `cd client && pnpm build` | bundle generado, sin warnings nuevos |
| Client tests | `cd client && pnpm test` | todos los tests escritos pasan |
| Smoke manual | `pnpm dev` + login + register + crear cuenta + ver dashboard | flujo end-to-end OK |

## Commits previstos

Cada uno deja la app compilable y arrancable.

1. Add client testing dependencies and vitest config
2. Extract shared layer (http, i18n bootstrap, ui, layout, hooks, lib)
3. Move user feature (auth, login, register, settings, /me)
4. Move account feature (accounts, banks, account-config, credentials)
5. Move banking feature (bank movements)
6. Move conciliation feature
7. Move script-engine feature
8. Move dashboard as cross-cutting feature
9. Compose routes per feature in App.tsx
10. Split i18n into per-feature namespaces
11. Add unit tests for hooks, mappers and feature smokes

## Fuera de alcance

- Compartir tipos/schemas entre backend y frontend (Zod, OpenAPI codegen, paquete shared). Eventualmente sí, no en este refactor.
- Refactor de `Dashboard.tsx` para reducir su duplicación con `BankMovements` — solo se mueve, no se reescribe internamente.
- E2E tests con Playwright — fuera de alcance; el smoke manual cubre.
- Migración a React Server Components, server-side state, o cualquier cambio arquitectónico mayor.
- Internacionalización a más idiomas — sigue siendo es/en.
