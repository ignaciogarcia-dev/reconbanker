# Frontend feature modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `client/src/` into feature modules (`features/<context>/`) aligned with the backend's five bounded contexts plus a cross-cutting `dashboard`, extract a `shared/` layer, map snake_case responses to camelCase in per-feature `api/` modules, split i18n into namespaces, and add unit tests with Vitest + React Testing Library + MSW.

**Architecture:** Each feature owns its pages, components, hooks, api functions, types, i18n, and routes. The `shared/` layer holds the axios singleton, i18n bootstrap, shadcn UI primitives, layout shells, and generic hooks. The router composes per-feature route fragments under a `PublicShell` (login/register) and a `ProtectedShell` (everything else, wrapping `AppLayout`). HTTP responses are mapped to camelCase inside `api/<resource>.ts` so the rest of the codebase never sees backend snake_case.

**Tech Stack:** React 19, Vite, React Router v7, TanStack Query v5, axios, shadcn/ui, Tailwind v4, i18next, Vitest, React Testing Library, MSW.

**Reference spec:** `docs/superpowers/specs/2026-05-17-frontend-feature-modules-design.md`

---

## Pre-task: starting state

Branch: `refactor/frontend-feature-modules` (already created from `main`).
Working directory: `/home/ignacio/workspace/reconbanker`.
The design doc has already been committed.

Before each task, verify the previous task's verification passed. After each task, run the listed checks before the commit step.

---

## Task 1: Add client testing dependencies and vitest config

**Files:**
- Modify: `client/package.json` (scripts + devDependencies)
- Create: `client/vitest.config.ts`
- Create: `client/tests/setup.ts`
- Create: `client/tests/msw/server.ts`
- Create: `client/tests/msw/handlers/index.ts`
- Create: `client/tsconfig.test.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm add -D vitest @vitest/coverage-v8 @vitest/ui \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jsdom msw
```

Expected: pnpm installs everything, no peer-dep errors.

- [ ] **Step 2: Create `client/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Note: `@vitejs/plugin-react` is already a transitive dep via Vite; if vitest complains, install it explicitly with `pnpm add -D @vitejs/plugin-react`.

- [ ] **Step 3: Create `client/tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

- [ ] **Step 4: Create `client/tests/msw/server.ts`**

```ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

- [ ] **Step 5: Create `client/tests/msw/handlers/index.ts`**

```ts
import type { HttpHandler } from 'msw'

// Per-feature handler arrays will be added in later tasks. Default to empty
// so tests opt-in to the handlers they need via `server.use(...accountHandlers)`.
export const handlers: HttpHandler[] = []
```

- [ ] **Step 6: Create `client/tsconfig.test.json`** (extends app config, adds tests/)

```json
{
  "extends": "./tsconfig.app.json",
  "compilerOptions": {
    "types": ["vitest/globals", "node", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*", "tests/**/*", "vitest.config.ts"]
}
```

- [ ] **Step 7: Add scripts to `client/package.json`**

In the `"scripts"` section, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"typecheck:test": "tsc -p tsconfig.test.json --noEmit"
```

- [ ] **Step 8: Smoke test the setup**

Create `client/tests/setup.smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })

  it('exposes jest-dom matchers', () => {
    const el = document.createElement('div')
    el.textContent = 'hello'
    expect(el).toHaveTextContent('hello')
  })
})
```

- [ ] **Step 9: Run the smoke test**

```bash
cd /home/ignacio/workspace/reconbanker/client && pnpm test tests/setup.smoke.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 10: Run typecheck**

```bash
cd /home/ignacio/workspace/reconbanker/client && pnpm typecheck:test
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/package.json client/pnpm-lock.yaml client/vitest.config.ts \
        client/tsconfig.test.json client/tests/ && \
git commit -m "Add Vitest, RTL and MSW setup for client"
```

---

## Task 2: Extract shared layer (http, layout, hooks, lib, i18n bootstrap)

**Files:**
- Move/create: `client/src/shared/http/client.ts` (was `lib/api.ts`)
- Move: `client/src/shared/lib/utils.ts` (from `lib/utils.ts`)
- Move: `client/src/shared/hooks/use-mobile.ts` (from `hooks/use-mobile.ts`)
- Move: `client/src/shared/layout/AppLayout.tsx` (from `components/layout/AppLayout.tsx`)
- Move: `client/src/shared/layout/LanguageSelector.tsx` (from `components/LanguageSelector.tsx`)
- Create: `client/src/shared/layout/PublicShell.tsx`
- Create: `client/src/shared/layout/ProtectedShell.tsx`
- Move: `client/src/shared/ui/*` (everything from `components/ui/`)
- Create: `client/src/shared/i18n/index.ts` (skeleton — features register later)
- Create: `client/src/shared/i18n/common.ts` (shared keys)

> **Note:** This task only **extracts** infrastructure. `AppLayout` still references old paths for now (Settings embedded as page, useUser from `lib/`); a later task moves those into `features/user/`. Keep current imports until those tasks; we will fix them one feature at a time.

- [ ] **Step 1: Move shadcn UI primitives**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/shared/ui && \
git mv src/components/ui/* src/shared/ui/
```

- [ ] **Step 2: Update imports of `@/components/ui/*` → `@/shared/ui/*`**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
grep -rl '@/components/ui/' src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|@/components/ui/|@/shared/ui/|g'
```

Verify nothing left:
```bash
grep -rn '@/components/ui/' src --include='*.ts' --include='*.tsx' || echo "OK: no leftover imports"
```

- [ ] **Step 3: Move `utils.ts`, `use-mobile.ts`, `LanguageSelector.tsx`, `AppLayout.tsx`**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/shared/lib src/shared/hooks src/shared/layout && \
git mv src/lib/utils.ts src/shared/lib/utils.ts && \
git mv src/hooks/use-mobile.ts src/shared/hooks/use-mobile.ts && \
git mv src/components/LanguageSelector.tsx src/shared/layout/LanguageSelector.tsx && \
git mv src/components/layout/AppLayout.tsx src/shared/layout/AppLayout.tsx
```

- [ ] **Step 4: Update imports for the moved files**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
grep -rl '@/lib/utils' src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|@/lib/utils|@/shared/lib/utils|g' && \
grep -rl '@/hooks/use-mobile' src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|@/hooks/use-mobile|@/shared/hooks/use-mobile|g' && \
grep -rl '@/components/LanguageSelector' src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|@/components/LanguageSelector|@/shared/layout/LanguageSelector|g' && \
grep -rl '@/components/layout/AppLayout' src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|@/components/layout/AppLayout|@/shared/layout/AppLayout|g'
```

- [ ] **Step 5: Rename `lib/api.ts` → `shared/http/client.ts`**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/shared/http && \
git mv src/lib/api.ts src/shared/http/client.ts
```

Edit `src/shared/http/client.ts` and rename the exported `api` → `httpClient`:

```ts
import axios from 'axios'

export const httpClient = axios.create({
  baseURL: 'http://localhost:3000',
})

httpClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

httpClient.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
```

- [ ] **Step 6: Update all imports of `api` from `@/lib/api`**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
grep -rl "from '@/lib/api'" src --include='*.ts' --include='*.tsx' | \
  xargs sed -i "s|from '@/lib/api'|from '@/shared/http/client'|g"
```

In every file that still uses the symbol `api.`, rename to `httpClient.`:
```bash
cd /home/ignacio/workspace/reconbanker/client && \
grep -rl "httpClient" src --include='*.ts' --include='*.tsx' | head -1
# spot-check; the next sed handles bulk:
grep -rln "from '@/shared/http/client'" src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|\bapi\.|httpClient.|g'
```

Then fix any `{ api }` named import that became `{ api }` → `{ httpClient }`:
```bash
grep -rln "import { api }" src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|import { api }|import { httpClient }|g'
```

- [ ] **Step 7: Move `lib/auth.tsx` and `lib/useUser.ts` to a temporary `shared/_legacy/` for now**

We need them to keep working but they semantically belong to `features/user/` (Task 3 moves them).

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/shared/_legacy && \
git mv src/lib/auth.tsx src/shared/_legacy/auth.tsx && \
git mv src/lib/useUser.ts src/shared/_legacy/useUser.ts
```

Update imports:
```bash
cd /home/ignacio/workspace/reconbanker/client && \
grep -rl "from '@/lib/auth'" src --include='*.ts' --include='*.tsx' | \
  xargs sed -i "s|from '@/lib/auth'|from '@/shared/_legacy/auth'|g" && \
grep -rl "from '@/lib/useUser'" src --include='*.ts' --include='*.tsx' | \
  xargs sed -i "s|from '@/lib/useUser'|from '@/shared/_legacy/useUser'|g"
```

`_legacy/` is a deliberate marker — Task 3 deletes it once `features/user/` exists.

- [ ] **Step 8: Remove now-empty old directories**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
rmdir src/lib src/hooks src/components/ui src/components/layout 2>/dev/null
ls src/components/  # should still have LanguageSelector if rmdir failed; we already moved it
ls src/lib 2>&1 || echo "OK: lib gone"
```

If `src/components/` is empty:
```bash
rmdir src/components 2>/dev/null
```

- [ ] **Step 9: Create `shared/layout/PublicShell.tsx`** (minimal wrapper)

```tsx
import { Outlet } from 'react-router-dom'

export function PublicShell() {
  return <Outlet />
}
```

- [ ] **Step 10: Create `shared/layout/ProtectedShell.tsx`** (auth guard + AppLayout)

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/shared/_legacy/auth'
import { AppLayout } from './AppLayout'

export function ProtectedShell() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
```

`AppLayout` today takes `children` — keep using that. Later we'll change it to `<Outlet />` directly when we move it under `features/user/`.

- [ ] **Step 11: Create `shared/i18n/common.ts` skeleton**

```ts
// Common i18n resources shared across features (nav, enums, mascot, error messages).
// Per-feature i18n is split in Task 10. For now this file is a placeholder so
// imports compile.
export const commonEs = {}
export const commonEn = {}
```

- [ ] **Step 12: Create `shared/i18n/index.ts` skeleton**

```ts
// i18next bootstrap. Per-feature namespaces are registered in Task 10.
// For now, re-export the existing init from `src/i18n/index.ts` so behaviour
// is unchanged.
export { default } from '@/i18n'
```

Keep `src/i18n/` unchanged for now — Task 10 splits it.

- [ ] **Step 13: Verify lint, typecheck, build, and dev server**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && \
pnpm typecheck:test && \
pnpm build
```

Expected: all green.

```bash
cd /home/ignacio/workspace/reconbanker && pnpm test 2>&1 | tail -3
```

Expected: backend unit tests still 102/102.

- [ ] **Step 14: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Extract shared layer (http, layout, ui, hooks, lib)"
```

---

## Task 3: Create the `user` feature

**Files:**
- Create: `client/src/features/user/types/index.ts`
- Create: `client/src/features/user/api/auth.ts`
- Create: `client/src/features/user/api/me.ts`
- Move: `client/src/features/user/providers/AuthProvider.tsx` (from `_legacy/auth.tsx`)
- Create: `client/src/features/user/hooks/useAuth.ts`
- Create: `client/src/features/user/hooks/useUser.ts`
- Create: `client/src/features/user/hooks/useSetOperationMode.ts`
- Move: `client/src/features/user/pages/Login.tsx` (from `pages/Login.tsx`)
- Move: `client/src/features/user/pages/Register.tsx` (from `pages/Register.tsx`)
- Move: `client/src/features/user/components/SettingsDialog.tsx` (extracted from `pages/Settings.tsx` if it exists, else from AppLayout embed)
- Move: `client/src/features/user/components/ModeSelectDialog.tsx` (from `components/ModeSelectDialog.tsx`)
- Move: `client/src/features/user/components/ModeOptionCards.tsx` (from `components/ModeOptionCards.tsx`)
- Create: `client/src/features/user/i18n/{es,en}.json` (extracted from `i18n/es.json`/`en.json`)
- Create: `client/src/features/user/i18n/index.ts`
- Create: `client/src/features/user/routes.tsx`
- Delete: `client/src/shared/_legacy/auth.tsx` and `client/src/shared/_legacy/useUser.ts`

- [ ] **Step 1: Create types**

`client/src/features/user/types/index.ts`:
```ts
export type OperationMode = 'reconcile' | 'passthrough'

export interface User {
  id: string
  email: string
  name?: string
}

export interface Me {
  id: string
  email: string
  name: string | null
  operationMode: OperationMode | null
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  name?: string
}

export interface LoginResponse {
  token: string
  user: User
}
```

- [ ] **Step 2: Create `api/auth.ts`**

`client/src/features/user/api/auth.ts`:
```ts
import { httpClient } from '@/shared/http/client'
import type { LoginInput, LoginResponse, RegisterInput, User } from '../types'

export async function login(input: LoginInput): Promise<LoginResponse> {
  const { data } = await httpClient.post<LoginResponse>('/auth/login', input)
  return data
}

export async function register(input: RegisterInput): Promise<{ id: string; email: string }> {
  const { data } = await httpClient.post<{ id: string; email: string }>('/auth/register', input)
  return data
}

export function logoutLocal(): void {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export function readStoredUser(): User | null {
  const token = localStorage.getItem('token')
  const saved = localStorage.getItem('user')
  if (!token || !saved) return null
  try {
    return JSON.parse(saved) as User
  } catch {
    return null
  }
}

export function persistSession(token: string, user: User): void {
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
}
```

- [ ] **Step 3: Create `api/me.ts`**

`client/src/features/user/api/me.ts`:
```ts
import { httpClient } from '@/shared/http/client'
import type { Me, OperationMode } from '../types'

interface MeRow {
  id: string
  email: string
  name: string | null
  operation_mode: OperationMode | null
}

export async function getMe(): Promise<Me> {
  const { data } = await httpClient.get<MeRow>('/me')
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    operationMode: data.operation_mode,
  }
}

export async function setOperationMode(mode: OperationMode): Promise<{ mode: OperationMode }> {
  const { data } = await httpClient.put<{ operation_mode: OperationMode }>('/me/operation-mode', { mode })
  return { mode: data.operation_mode }
}
```

- [ ] **Step 4: Move auth provider**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/user/providers && \
git mv src/shared/_legacy/auth.tsx src/features/user/providers/AuthProvider.tsx
```

Edit `client/src/features/user/providers/AuthProvider.tsx` — split the file: keep ONLY the provider component here, move `useAuth` to its own file (next step). The provider should look like:

```tsx
import { createContext, useState, type ReactNode } from 'react'
import { login as apiLogin, persistSession, logoutLocal, readStoredUser } from '../api/auth'
import type { User } from '../types'

export interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser)

  async function login(email: string, password: string) {
    const { token, user } = await apiLogin({ email, password })
    persistSession(token, user)
    setUser(user)
  }

  function logout() {
    logoutLocal()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  )
}
```

- [ ] **Step 5: Create `hooks/useAuth.ts`**

`client/src/features/user/hooks/useAuth.ts`:
```ts
import { useContext } from 'react'
import { AuthContext } from '../providers/AuthProvider'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 6: Move and split `useUser`**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
git mv src/shared/_legacy/useUser.ts src/features/user/hooks/useUser.ts
```

Edit `client/src/features/user/hooks/useUser.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/me'

export const meQueryKey = ['me'] as const

export function useUser() {
  return useQuery({ queryKey: meQueryKey, queryFn: getMe })
}
```

- [ ] **Step 7: Create `hooks/useSetOperationMode.ts`**

Cross-feature invalidations are forward-declared; the imported `queryKey`s will exist after Tasks 4, 5, 6.

`client/src/features/user/hooks/useSetOperationMode.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setOperationMode } from '../api/me'
import { meQueryKey } from './useUser'
import { accountsQueryKey } from '@/features/account/hooks/useAccounts'
import { conciliationsQueryKey } from '@/features/conciliation/hooks/useConciliations'
import { bankMovementsQueryKey } from '@/features/banking/hooks/useBankMovements'

export function useSetOperationMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setOperationMode,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meQueryKey })
      qc.invalidateQueries({ queryKey: accountsQueryKey })
      qc.invalidateQueries({ queryKey: conciliationsQueryKey })
      qc.invalidateQueries({ queryKey: bankMovementsQueryKey })
    },
  })
}
```

> **Note:** This file will fail typecheck until Tasks 4, 5, 6 create those keys. Skip adding it to imports until then — leave it in place; we'll wire it up in Task 9.

If typecheck fails NOW because of those imports, comment them out with a `// TODO Task 9: re-enable cross-feature invalidations` and add the lines without the imports. The file will be re-edited in Task 9.

Actual content for this task (compilable now):
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setOperationMode } from '../api/me'
import { meQueryKey } from './useUser'

export function useSetOperationMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setOperationMode,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meQueryKey })
      // TODO(Task 9): also invalidate accounts/conciliations/movements when those keys exist
    },
  })
}
```

- [ ] **Step 8: Move pages**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/user/pages && \
git mv src/pages/Login.tsx src/features/user/pages/Login.tsx && \
git mv src/pages/Register.tsx src/features/user/pages/Register.tsx
```

Update imports inside those two files:
- `from '@/lib/auth'` is already mapped to `@/shared/_legacy/auth` (Task 2). Now update both files to `from '../hooks/useAuth'` (Login uses `useAuth`).
- `from '@/lib/api'` already mapped to `@/shared/http/client` and renamed (Task 2). Register uses it directly; replace with `from '../api/auth'` and call `register(...)` instead.

Open `client/src/features/user/pages/Login.tsx` and ensure:
```tsx
import { useAuth } from '../hooks/useAuth'
```

Open `client/src/features/user/pages/Register.tsx` and ensure the API call goes through `register`:
```tsx
import { register } from '../api/auth'
// inside handleSubmit:
await register({ email, password, name: name || undefined })
```

Remove now-unused imports (`httpClient` etc).

- [ ] **Step 9: Move user-related components**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/user/components && \
[ -f src/components/ModeSelectDialog.tsx ] && \
  git mv src/components/ModeSelectDialog.tsx src/features/user/components/ModeSelectDialog.tsx
[ -f src/components/ModeOptionCards.tsx ] && \
  git mv src/components/ModeOptionCards.tsx src/features/user/components/ModeOptionCards.tsx
```

Update imports across the codebase:
```bash
grep -rl '@/components/ModeSelectDialog' src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|@/components/ModeSelectDialog|@/features/user/components/ModeSelectDialog|g'
grep -rl '@/components/ModeOptionCards' src --include='*.ts' --include='*.tsx' | \
  xargs sed -i 's|@/components/ModeOptionCards|@/features/user/components/ModeOptionCards|g'
```

- [ ] **Step 10: Extract `SettingsDialog`**

Inspect `src/shared/layout/AppLayout.tsx`. If it imports a Settings page or has an inline settings dialog, extract that JSX to `client/src/features/user/components/SettingsDialog.tsx`.

If `src/pages/Settings.tsx` exists:
```bash
git mv src/pages/Settings.tsx src/features/user/components/SettingsDialog.tsx
```

Edit the file to be a `<Dialog>` component exporting `SettingsDialog({ open, onOpenChange })`. Update `AppLayout.tsx` to import from `@/features/user/components/SettingsDialog`.

If `Settings.tsx` doesn't exist (settings was inline in AppLayout), create `SettingsDialog.tsx` by extracting the inline JSX. Replace the inline block in `AppLayout.tsx` with `<SettingsDialog open={...} onOpenChange={...} />`.

- [ ] **Step 11: Update `AppLayout` to use the new useAuth/useUser hooks**

In `src/shared/layout/AppLayout.tsx`:
```tsx
import { useAuth } from '@/features/user/hooks/useAuth'
import { useUser } from '@/features/user/hooks/useUser'
```

(Remove imports from `@/shared/_legacy/*`.)

- [ ] **Step 12: Delete `_legacy/`**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
rm -rf src/shared/_legacy
grep -rn '@/shared/_legacy' src --include='*.ts' --include='*.tsx' || echo "OK: no leftover legacy refs"
```

If grep finds anything, fix the remaining imports manually.

- [ ] **Step 13: Create `i18n/{es,en}.json` for user**

Open `src/i18n/es.json` and `src/i18n/en.json`. Identify keys under `login`, `register`, `settings`. Extract them to:

`client/src/features/user/i18n/es.json`:
```json
{
  "login": {  /* ... copy login keys from src/i18n/es.json ... */ },
  "register": { /* ... */ },
  "settings": { /* ... */ }
}
```

`client/src/features/user/i18n/en.json`: same shape, English.

`client/src/features/user/i18n/index.ts`:
```ts
import es from './es.json'
import en from './en.json'

export { es as userEs, en as userEn }
```

Do NOT remove keys from `src/i18n/es.json` yet — Task 10 does that in one shot.

- [ ] **Step 14: Create `routes.tsx`**

`client/src/features/user/routes.tsx`:
```tsx
import { Route } from 'react-router-dom'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

export const userPublicRoutes = (
  <>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
  </>
)
```

- [ ] **Step 15: Write the first unit test — useAuth without provider throws**

`client/src/features/user/hooks/useAuth.test.ts`:
```ts
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useAuth } from './useAuth'

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
  })
})
```

- [ ] **Step 16: Run the test**

```bash
cd /home/ignacio/workspace/reconbanker/client && pnpm test src/features/user/hooks/useAuth.test.ts
```

Expected: 1 test passes.

- [ ] **Step 17: Verify everything still compiles**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build
```

Expected: green.

- [ ] **Step 18: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src client/package.json client/pnpm-lock.yaml && \
git commit -m "Create user feature module"
```

---

## Task 4: Create the `account` feature

**Files:**
- Create: `client/src/features/account/types/index.ts`
- Create: `client/src/features/account/api/{banks,accounts,accountConfig}.ts`
- Create: `client/src/features/account/hooks/{useBanks,useAccounts,useAccountConfig}.ts`
- Move: `client/src/features/account/pages/{Banks,Accounts,AccountConfig}.tsx`
- Create: `client/src/features/account/i18n/{es,en}.json`, `index.ts`
- Create: `client/src/features/account/routes.tsx`

- [ ] **Step 1: Create types**

`client/src/features/account/types/index.ts`:
```ts
export type AccountStatus = 'active' | 'inactive'
export type BankStatus = 'pending' | 'onboarding' | 'ready' | 'failed'
export type AuthType = 'bearer' | 'api_key'
export type PollingMethod = 'GET' | 'POST'

export interface Bank {
  id: string
  code: string
  name: string
  loginUrl: string | null
  status: BankStatus
}

export interface Account {
  id: string
  bank: string
  name: string | null
  status: AccountStatus
}

export interface AccountConfig {
  id: string
  accountId: string
  pendingOrdersEndpoint: string | null
  webhookUrl: string
  retryLimit: number
  pollingMethod: PollingMethod
  pollingBody: Record<string, unknown> | null
  authType: AuthType
  authToken: string | null
  webhookAuthType: AuthType | null
  webhookAuthToken: string | null
  notifyOnExpired: boolean
  webhookExtraFields: Record<string, unknown> | null
  silentIngestion: boolean
  bankUsername: string | null
}

export interface CreateAccountInput {
  bankId: string
  name: string
}

export interface UpsertAccountConfigInput
  extends Omit<AccountConfig, 'id' | 'accountId' | 'bankUsername'> {
  bankUsername: string | null
  bankPassword: string | null
}
```

- [ ] **Step 2: Create `api/banks.ts`**

```ts
import { httpClient } from '@/shared/http/client'
import type { Bank } from '../types'

interface BankRow {
  id: string
  code: string
  name: string
  loginUrl: string | null
  status: Bank['status']
}

export async function listBanks(): Promise<Bank[]> {
  const { data } = await httpClient.get<BankRow[]>('/banks')
  return data.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    loginUrl: r.loginUrl,
    status: r.status,
  }))
}
```

- [ ] **Step 3: Create `api/accounts.ts`**

```ts
import { httpClient } from '@/shared/http/client'
import type { Account, CreateAccountInput } from '../types'

interface AccountRow {
  id: string
  bank: string
  name: string | null
  status: Account['status']
}

export async function listAccounts(): Promise<Account[]> {
  const { data } = await httpClient.get<AccountRow[]>('/accounts')
  return data.map(toAccount)
}

export async function getAccount(accountId: string): Promise<Account> {
  const { data } = await httpClient.get<AccountRow>(`/accounts/${accountId}`)
  return toAccount(data)
}

export async function createAccount(input: CreateAccountInput): Promise<{ id: string }> {
  const { data } = await httpClient.post<{ id: string }>('/accounts', input)
  return data
}

export async function deleteAccount(accountId: string, confirmationName: string): Promise<void> {
  await httpClient.delete(`/accounts/${accountId}`, {
    data: { confirmation_name: confirmationName },
  })
}

export async function enqueueScrape(accountId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/accounts/${accountId}/scrape`)
  return data
}

function toAccount(row: AccountRow): Account {
  return { id: row.id, bank: row.bank, name: row.name, status: row.status }
}
```

- [ ] **Step 4: Create `api/accountConfig.ts`**

```ts
import { httpClient } from '@/shared/http/client'
import type { AccountConfig, UpsertAccountConfigInput } from '../types'

interface AccountConfigRow {
  id: string
  account_id: string
  pending_orders_endpoint: string | null
  webhook_url: string
  retry_limit: number
  polling_method: AccountConfig['pollingMethod']
  polling_body: Record<string, unknown> | null
  auth_type: AccountConfig['authType']
  auth_token: string | null
  webhook_auth_type: AccountConfig['webhookAuthType']
  webhook_auth_token: string | null
  notify_on_expired: boolean
  webhook_extra_fields: Record<string, unknown> | null
  silent_ingestion: boolean
  bank_username: string | null
}

export async function getAccountConfig(accountId: string): Promise<AccountConfig | null> {
  const { data } = await httpClient.get<AccountConfigRow | null>(`/accounts/${accountId}/config`)
  return data ? toAccountConfig(data) : null
}

export async function upsertAccountConfig(
  accountId: string,
  input: UpsertAccountConfigInput
): Promise<AccountConfig> {
  const { data } = await httpClient.put<AccountConfigRow>(
    `/accounts/${accountId}/config`,
    toBackendBody(input)
  )
  return toAccountConfig(data)
}

function toAccountConfig(row: AccountConfigRow): AccountConfig {
  return {
    id: row.id,
    accountId: row.account_id,
    pendingOrdersEndpoint: row.pending_orders_endpoint,
    webhookUrl: row.webhook_url,
    retryLimit: row.retry_limit,
    pollingMethod: row.polling_method,
    pollingBody: row.polling_body,
    authType: row.auth_type,
    authToken: row.auth_token,
    webhookAuthType: row.webhook_auth_type,
    webhookAuthToken: row.webhook_auth_token,
    notifyOnExpired: row.notify_on_expired,
    webhookExtraFields: row.webhook_extra_fields,
    silentIngestion: row.silent_ingestion,
    bankUsername: row.bank_username,
  }
}

function toBackendBody(input: UpsertAccountConfigInput) {
  return {
    pending_orders_endpoint: input.pendingOrdersEndpoint,
    webhook_url: input.webhookUrl,
    retry_limit: input.retryLimit,
    polling_method: input.pollingMethod,
    polling_body: input.pollingBody,
    auth_type: input.authType,
    auth_token: input.authToken,
    webhook_auth_type: input.webhookAuthType,
    webhook_auth_token: input.webhookAuthToken,
    notify_on_expired: input.notifyOnExpired,
    webhook_extra_fields: input.webhookExtraFields,
    silent_ingestion: input.silentIngestion,
    bank_username: input.bankUsername,
    bank_password: input.bankPassword,
  }
}
```

- [ ] **Step 5: Write a failing test for the mapper round-trip**

`client/src/features/account/api/accountConfig.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { getAccountConfig, upsertAccountConfig } from './accountConfig'

describe('accountConfig api', () => {
  it('maps snake_case row to camelCase AccountConfig', async () => {
    server.use(
      http.get('http://localhost:3000/accounts/acc-1/config', () =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: 'acc-1',
          pending_orders_endpoint: null,
          webhook_url: 'https://hook',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: 'tok',
          webhook_auth_type: null,
          webhook_auth_token: null,
          notify_on_expired: false,
          webhook_extra_fields: { source: 'fe' },
          silent_ingestion: true,
          bank_username: 'alice',
        })
      )
    )
    const cfg = await getAccountConfig('acc-1')
    expect(cfg).toEqual({
      id: 'cfg-1',
      accountId: 'acc-1',
      pendingOrdersEndpoint: null,
      webhookUrl: 'https://hook',
      retryLimit: 3,
      pollingMethod: 'GET',
      pollingBody: null,
      authType: 'bearer',
      authToken: 'tok',
      webhookAuthType: null,
      webhookAuthToken: null,
      notifyOnExpired: false,
      webhookExtraFields: { source: 'fe' },
      silentIngestion: true,
      bankUsername: 'alice',
    })
  })

  it('returns null when the server responds with null', async () => {
    server.use(
      http.get('http://localhost:3000/accounts/acc-1/config', () =>
        HttpResponse.json(null)
      )
    )
    expect(await getAccountConfig('acc-1')).toBeNull()
  })

  it('sends camelCase input as snake_case body on upsert', async () => {
    let received: any = null
    server.use(
      http.put('http://localhost:3000/accounts/acc-1/config', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({
          id: 'cfg-1', account_id: 'acc-1',
          pending_orders_endpoint: null, webhook_url: 'h',
          retry_limit: 3, polling_method: 'GET', polling_body: null,
          auth_type: 'bearer', auth_token: null,
          webhook_auth_type: null, webhook_auth_token: null,
          notify_on_expired: false, webhook_extra_fields: null,
          silent_ingestion: false, bank_username: null,
        })
      })
    )
    await upsertAccountConfig('acc-1', {
      pendingOrdersEndpoint: null, webhookUrl: 'h',
      retryLimit: 3, pollingMethod: 'GET', pollingBody: null,
      authType: 'bearer', authToken: null,
      webhookAuthType: null, webhookAuthToken: null,
      notifyOnExpired: false, webhookExtraFields: null,
      silentIngestion: false,
      bankUsername: 'alice', bankPassword: 'secret',
    })
    expect(received).toEqual({
      pending_orders_endpoint: null, webhook_url: 'h',
      retry_limit: 3, polling_method: 'GET', polling_body: null,
      auth_type: 'bearer', auth_token: null,
      webhook_auth_type: null, webhook_auth_token: null,
      notify_on_expired: false, webhook_extra_fields: null,
      silent_ingestion: false,
      bank_username: 'alice', bank_password: 'secret',
    })
  })
})
```

- [ ] **Step 6: Run the test**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm test src/features/account/api/accountConfig.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7: Create hooks**

`client/src/features/account/hooks/useBanks.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { listBanks } from '../api/banks'

export const banksQueryKey = ['banks'] as const

export function useBanks() {
  return useQuery({ queryKey: banksQueryKey, queryFn: listBanks })
}
```

`client/src/features/account/hooks/useAccounts.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAccounts, createAccount, deleteAccount, enqueueScrape, getAccount } from '../api/accounts'

export const accountsQueryKey = ['accounts'] as const

export function useAccounts() {
  return useQuery({ queryKey: accountsQueryKey, queryFn: listAccounts })
}

export function useAccount(accountId: string | undefined) {
  return useQuery({
    queryKey: ['account', accountId],
    queryFn: () => getAccount(accountId!),
    enabled: !!accountId,
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQueryKey }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, confirmationName }: { accountId: string; confirmationName: string }) =>
      deleteAccount(accountId, confirmationName),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQueryKey }),
  })
}

export function useEnqueueScrape() {
  return useMutation({ mutationFn: enqueueScrape })
}
```

`client/src/features/account/hooks/useAccountConfig.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAccountConfig, upsertAccountConfig } from '../api/accountConfig'
import type { UpsertAccountConfigInput } from '../types'

export const accountConfigQueryKey = (accountId: string | undefined) => ['account-config', accountId] as const

export function useAccountConfig(accountId: string | undefined) {
  return useQuery({
    queryKey: accountConfigQueryKey(accountId),
    queryFn: () => getAccountConfig(accountId!),
    enabled: !!accountId,
  })
}

export function useUpsertAccountConfig(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertAccountConfigInput) => upsertAccountConfig(accountId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountConfigQueryKey(accountId) }),
  })
}
```

- [ ] **Step 8: Move pages**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/account/pages && \
git mv src/pages/Banks.tsx src/features/account/pages/Banks.tsx && \
git mv src/pages/Accounts.tsx src/features/account/pages/Accounts.tsx && \
git mv src/pages/AccountConfig.tsx src/features/account/pages/AccountConfig.tsx
```

In each moved file, rewrite HTTP calls to use the hooks above (replace `useQuery({ queryKey: ['accounts'], queryFn: () => httpClient.get('/accounts').then(r => r.data) })` with `useAccounts()`, etc.) and remove inline types — import from `../types`.

For each page, the diff is mechanical:
- Replace `useQuery/useMutation` blocks that wrap `httpClient.get/post/...` with calls to the hooks (`useAccounts`, `useBanks`, `useAccountConfig`, `useUpsertAccountConfig`, `useDeleteAccount`, `useEnqueueScrape`).
- Delete inline `interface Bank/Account/AccountConfig` declarations; import from `../types`.
- Adjust property access: `a.notified_at` (snake) → `a.notifiedAt` (camel). Search for any snake_case access on bound props and convert.

- [ ] **Step 9: Create i18n files**

`client/src/features/account/i18n/es.json`:
```json
{
  "accounts": { /* copy "accounts" block from src/i18n/es.json */ },
  "banks": { /* copy "banks" block */ },
  "accountConfig": { /* copy "accountConfig" block */ }
}
```

`client/src/features/account/i18n/en.json`: same shape, English.

`client/src/features/account/i18n/index.ts`:
```ts
import es from './es.json'
import en from './en.json'

export { es as accountEs, en as accountEn }
```

- [ ] **Step 10: Create `routes.tsx`**

```tsx
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

- [ ] **Step 11: Verify**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build && pnpm test
```

Expected: all green.

- [ ] **Step 12: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Create account feature module"
```

---

## Task 5: Create the `banking` feature

**Files:**
- Create: `client/src/features/banking/types/index.ts`
- Create: `client/src/features/banking/api/movements.ts`
- Create: `client/src/features/banking/hooks/useBankMovements.ts`
- Move: `client/src/features/banking/pages/BankMovements.tsx`
- Create: `client/src/features/banking/i18n/{es,en}.json`, `index.ts`
- Create: `client/src/features/banking/routes.tsx`

- [ ] **Step 1: Create types**

```ts
export interface BankMovement {
  id: string
  externalId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: string
  notifiedAt: string | null
  excludedAt: string | null
}
```

- [ ] **Step 2: Create `api/movements.ts`**

```ts
import { httpClient } from '@/shared/http/client'
import type { BankMovement } from '../types'

interface BankMovementRow {
  id: string
  externalId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: string
  notifiedAt: string | null
  excludedAt: string | null
}

export async function listBankMovements(accountId: string, limit = 100, offset = 0): Promise<BankMovement[]> {
  const { data } = await httpClient.get<BankMovementRow[]>(
    `/accounts/${accountId}/movements`,
    { params: { limit, offset } }
  )
  return data.map((r) => ({
    id: r.id,
    externalId: r.externalId,
    amount: r.amount,
    currency: r.currency,
    senderName: r.senderName,
    receivedAt: r.receivedAt,
    notifiedAt: r.notifiedAt,
    excludedAt: r.excludedAt,
  }))
}

export async function reNotifyMovement(accountId: string, movementId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(
    `/accounts/${accountId}/movements/${movementId}/notify`
  )
  return data
}
```

> The backend already returns these in camelCase (per Phase 2 BankMovementReadModel — verified in integration tests). Mappers here are pass-through; we keep them for symmetry and so future shape changes have one place to land.

- [ ] **Step 3: Create hook**

`client/src/features/banking/hooks/useBankMovements.ts`:
```ts
import { useQuery, useMutation } from '@tanstack/react-query'
import { listBankMovements, reNotifyMovement } from '../api/movements'

export const bankMovementsQueryKey = (accountId: string | undefined) =>
  ['bank-movements', accountId] as const

export function useBankMovements(accountId: string | undefined, limit = 100, offset = 0) {
  return useQuery({
    queryKey: [...bankMovementsQueryKey(accountId), limit, offset] as const,
    queryFn: () => listBankMovements(accountId!, limit, offset),
    enabled: !!accountId,
  })
}

export function useReNotifyMovement(accountId: string) {
  return useMutation({
    mutationFn: (movementId: string) => reNotifyMovement(accountId, movementId),
  })
}
```

- [ ] **Step 4: Move page**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/banking/pages && \
git mv src/pages/BankMovements.tsx src/features/banking/pages/BankMovements.tsx
```

Edit the page: remove inline types, replace inline `useQuery({...httpClient.get('/accounts/X/movements')...})` with `useBankMovements(accountId)`, replace the notify call with `useReNotifyMovement(accountId).mutate(movementId)`.

- [ ] **Step 5: Create i18n**

```json
// es.json
{ "movements": { /* copy "movements" block from src/i18n/es.json */ } }
```

```ts
// index.ts
import es from './es.json'
import en from './en.json'
export { es as bankingEs, en as bankingEn }
```

- [ ] **Step 6: Create routes**

```tsx
import { Route } from 'react-router-dom'
import { BankMovements } from './pages/BankMovements'

export const bankingRoutes = (
  <>
    <Route path="/movements" element={<BankMovements />} />
  </>
)
```

- [ ] **Step 7: Verify**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build && pnpm test
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Create banking feature module"
```

---

## Task 6: Create the `conciliation` feature

**Files:** analogous structure to Task 5.

- [ ] **Step 1: Create `types/index.ts`**

```ts
export type ConciliationStatus =
  | 'pending' | 'processing' | 'matched'
  | 'not_found' | 'ambiguous' | 'failed' | 'expired' | 'cancelled'

export interface ConciliationRequestListItem {
  id: string
  accountId: string
  externalId: string
  expectedAmount: number
  currency: string
  senderName: string | null
  status: ConciliationStatus
  retryCount: number
  lastCheckedAt: string | null
  createdAt: string
  bank: string | null
  accountName: string | null
}

export interface ConciliationAttempt {
  id: string
  attemptNumber: number
  status: string
  failureType: string | null
  candidateIds: string[]
  selectedTransactionId: string | null
  createdAt: string
}

export interface ConciliationMatch {
  id: string
  bankTransactionId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: string
  isPrimary: boolean
  isNotified: boolean
  matchedAt: string
}

export interface ConciliationRequestDetail extends ConciliationRequestListItem {
  attempts: ConciliationAttempt[]
  match: ConciliationMatch | null
}

export interface ListFilter {
  status?: string
  limit?: number
  offset?: number
}
```

- [ ] **Step 2: Create `api/conciliations.ts`**

Backend already returns these in the right shape (per Phase 1 `ConciliationReadModel` integration tests). Pass-through mappers for consistency.

```ts
import { httpClient } from '@/shared/http/client'
import type {
  ConciliationRequestListItem, ConciliationRequestDetail, ListFilter,
} from '../types'

export async function listConciliations(filter: ListFilter = {}): Promise<ConciliationRequestListItem[]> {
  const { data } = await httpClient.get<ConciliationRequestListItem[]>('/conciliation', {
    params: { limit: filter.limit ?? 50, offset: filter.offset ?? 0, status: filter.status },
  })
  return data
}

export async function getConciliation(requestId: string): Promise<ConciliationRequestDetail> {
  const { data } = await httpClient.get<ConciliationRequestDetail>(`/conciliation/${requestId}`)
  return data
}

export async function enqueueRun(requestId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/conciliation/${requestId}/run`)
  return data
}

export async function enqueueNotify(requestId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/conciliation/${requestId}/notify`)
  return data
}

export async function enqueuePoll(accountId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/conciliation/poll/${accountId}`)
  return data
}
```

- [ ] **Step 3: Create `hooks/useConciliations.ts`**

```ts
import { useQuery, useMutation } from '@tanstack/react-query'
import { listConciliations, getConciliation, enqueueRun, enqueueNotify, enqueuePoll } from '../api/conciliations'
import type { ListFilter } from '../types'

export const conciliationsQueryKey = ['conciliations'] as const

export function useConciliations(filter: ListFilter = {}) {
  return useQuery({
    queryKey: [...conciliationsQueryKey, filter] as const,
    queryFn: () => listConciliations(filter),
  })
}

export function useConciliation(requestId: string | undefined) {
  return useQuery({
    queryKey: ['conciliation', requestId] as const,
    queryFn: () => getConciliation(requestId!),
    enabled: !!requestId,
  })
}

export function useRunConciliation() {
  return useMutation({ mutationFn: enqueueRun })
}

export function useNotifyConciliation() {
  return useMutation({ mutationFn: enqueueNotify })
}

export function usePollConciliation() {
  return useMutation({ mutationFn: enqueuePoll })
}
```

- [ ] **Step 4: Move page**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/conciliation/pages && \
git mv src/pages/Conciliations.tsx src/features/conciliation/pages/Conciliations.tsx
```

Edit the page to use the hooks; remove inline types; replace inline HTTP calls.

- [ ] **Step 5: i18n + routes**

`client/src/features/conciliation/i18n/{es,en}.json` extracted from `src/i18n/{es,en}.json` (the `conciliations` block).

`client/src/features/conciliation/i18n/index.ts`:
```ts
import es from './es.json'
import en from './en.json'
export { es as conciliationEs, en as conciliationEn }
```

`client/src/features/conciliation/routes.tsx`:
```tsx
import { Route } from 'react-router-dom'
import { Conciliations } from './pages/Conciliations'

export const conciliationRoutes = (
  <>
    <Route path="/conciliations" element={<Conciliations />} />
  </>
)
```

- [ ] **Step 6: Verify + commit**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build && pnpm test
```

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Create conciliation feature module"
```

---

## Task 7: Create the `script-engine` feature

**Files:** parallel to Task 5.

- [ ] **Step 1: types**

```ts
export type ScriptStatus = 'draft' | 'testing' | 'review' | 'active' | 'deprecated' | 'failed'

export interface Script {
  id: string
  bank: string
  flowType: string
  version: string
  status: ScriptStatus
  origin: string
  createdAt: string
}
```

- [ ] **Step 2: `api/scripts.ts`**

```ts
import { httpClient } from '@/shared/http/client'
import type { Script } from '../types'

export async function listScripts(): Promise<Script[]> {
  const { data } = await httpClient.get<Script[]>('/scripts')
  return data
}

export async function promoteScript(scriptId: string): Promise<void> {
  await httpClient.post(`/scripts/${scriptId}/promote`)
}
```

- [ ] **Step 3: hook**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listScripts, promoteScript } from '../api/scripts'

export const scriptsQueryKey = ['scripts'] as const

export function useScripts() {
  return useQuery({ queryKey: scriptsQueryKey, queryFn: listScripts })
}

export function usePromoteScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: promoteScript,
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptsQueryKey }),
  })
}
```

- [ ] **Step 4: move page, i18n, routes**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/script-engine/pages && \
git mv src/pages/Scripts.tsx src/features/script-engine/pages/Scripts.tsx
```

Update page to use hooks + types.

`i18n/index.ts`:
```ts
import es from './es.json'
import en from './en.json'
export { es as scriptEngineEs, en as scriptEngineEn }
```

`routes.tsx`:
```tsx
import { Route } from 'react-router-dom'
import { Scripts } from './pages/Scripts'

export const scriptEngineRoutes = (
  <>
    <Route path="/scripts" element={<Scripts />} />
  </>
)
```

- [ ] **Step 5: Verify + commit**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build && pnpm test
```

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Create script-engine feature module"
```

---

## Task 8: Move `Dashboard` as cross-cutting feature

**Files:**
- Move: `client/src/features/dashboard/pages/Dashboard.tsx`
- Create: `client/src/features/dashboard/i18n/{es,en}.json`, `index.ts`
- Create: `client/src/features/dashboard/routes.tsx`

- [ ] **Step 1: Move page**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
mkdir -p src/features/dashboard/pages && \
git mv src/pages/Dashboard.tsx src/features/dashboard/pages/Dashboard.tsx
```

- [ ] **Step 2: Rewrite Dashboard to consume cross-feature hooks**

Replace inline `useQuery` blocks in `Dashboard.tsx` with imports from the other features:
```tsx
import { useAccounts } from '@/features/account/hooks/useAccounts'
import { useBankMovements } from '@/features/banking/hooks/useBankMovements'
import { useConciliations } from '@/features/conciliation/hooks/useConciliations'
```

Adjust the per-account movements query: if today it iterates accounts and queries each, keep that pattern but using `useBankMovements(account.id)` per account. (This was identified as a duplication in the audit but is **out of scope** for this refactor — just move, do not rewrite.)

Remove inline type declarations; import from each feature's `types/`.

- [ ] **Step 3: i18n + routes**

`client/src/features/dashboard/i18n/{es,en}.json` (extract `dashboard` block).

`client/src/features/dashboard/i18n/index.ts`:
```ts
import es from './es.json'
import en from './en.json'
export { es as dashboardEs, en as dashboardEn }
```

`client/src/features/dashboard/routes.tsx`:
```tsx
import { Route } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'

export const dashboardRoutes = (
  <>
    <Route path="/" element={<Dashboard />} />
  </>
)
```

- [ ] **Step 4: Verify + commit**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build && pnpm test
```

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Move dashboard as cross-cutting feature module"
```

---

## Task 9: Compose routes per feature in `App.tsx` (and wire cross-feature invalidations)

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/features/user/hooks/useSetOperationMode.ts` (uncomment the cross-feature invalidations)
- Delete: `client/src/pages/` (should be empty by now)

- [ ] **Step 1: Verify `pages/` is empty**

```bash
cd /home/ignacio/workspace/reconbanker/client && ls src/pages 2>&1
```

If any file remains, find it via grep and check whether it needs a home (typically a forgotten page from earlier moves).

- [ ] **Step 2: Rewrite `App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/user/providers/AuthProvider'
import { PublicShell } from '@/shared/layout/PublicShell'
import { ProtectedShell } from '@/shared/layout/ProtectedShell'
import { userPublicRoutes } from '@/features/user/routes'
import { dashboardRoutes } from '@/features/dashboard/routes'
import { accountRoutes } from '@/features/account/routes'
import { bankingRoutes } from '@/features/banking/routes'
import { conciliationRoutes } from '@/features/conciliation/routes'
import { scriptEngineRoutes } from '@/features/script-engine/routes'
import '@/shared/i18n'

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  )
}
```

If today `App.tsx` already wraps with `QueryClientProvider` and `BrowserRouter`, keep that wiring. The key change is: routes are now per-feature.

- [ ] **Step 3: Uncomment cross-feature invalidations in `useSetOperationMode`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setOperationMode } from '../api/me'
import { meQueryKey } from './useUser'
import { accountsQueryKey } from '@/features/account/hooks/useAccounts'
import { conciliationsQueryKey } from '@/features/conciliation/hooks/useConciliations'
import { bankMovementsQueryKey } from '@/features/banking/hooks/useBankMovements'

export function useSetOperationMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setOperationMode,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meQueryKey })
      qc.invalidateQueries({ queryKey: accountsQueryKey })
      qc.invalidateQueries({ queryKey: conciliationsQueryKey })
      qc.invalidateQueries({ queryKey: bankMovementsQueryKey('') })  // base key; partial match invalidates all account-scoped
    },
  })
}
```

Note: `bankMovementsQueryKey` is a function (`(accountId) => ['bank-movements', accountId]`). To invalidate all variations, use `queryKey: ['bank-movements']` directly:

```ts
qc.invalidateQueries({ queryKey: ['bank-movements'] })
```

- [ ] **Step 4: Delete the now-empty `pages/` directory**

```bash
cd /home/ignacio/workspace/reconbanker/client && rmdir src/pages 2>/dev/null && echo "OK"
```

- [ ] **Step 5: Verify**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build && pnpm test
```

Expected: green.

- [ ] **Step 6: Manual smoke test**

```bash
cd /home/ignacio/workspace/reconbanker && bash setup.sh &
```

Visit:
- `http://localhost:5173/login` — login form appears
- After login: `/`, `/accounts`, `/banks`, `/movements`, `/conciliations`, `/scripts` — all load without errors in console
- Create an account, view its config, save changes — verify network tab shows snake_case body
- Change operation mode in Settings — verify Dashboard refetches

Kill the server:
```bash
pkill -f 'tsx watch'
pkill -f 'vite'
```

- [ ] **Step 7: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Compose feature routes in App.tsx"
```

---

## Task 10: Split i18n into per-feature namespaces

**Files:**
- Modify: `client/src/shared/i18n/index.ts` (replace skeleton with real wiring)
- Modify: `client/src/shared/i18n/common.ts` (fill in shared keys)
- Delete: `client/src/i18n/` (the old central JSONs)
- Update every component that uses `useTranslation` to specify a namespace

- [ ] **Step 1: Move shared keys to `shared/i18n/common.ts`**

From `client/src/i18n/es.json` and `client/src/i18n/en.json`, copy the keys under `nav`, `enums`, `mascot`, plus any error/generic keys into:

`client/src/shared/i18n/common.ts`:
```ts
export const commonEs = {
  nav: { /* ... */ },
  enums: { /* accountStatus, scriptStatus, etc. */ },
  mascot: { /* ... */ },
}

export const commonEn = {
  nav: { /* ... */ },
  enums: { /* ... */ },
  mascot: { /* ... */ },
}
```

- [ ] **Step 2: Rewrite `shared/i18n/index.ts`**

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { commonEs, commonEn } from './common'
import { userEs, userEn } from '@/features/user/i18n'
import { accountEs, accountEn } from '@/features/account/i18n'
import { bankingEs, bankingEn } from '@/features/banking/i18n'
import { conciliationEs, conciliationEn } from '@/features/conciliation/i18n'
import { scriptEngineEs, scriptEngineEn } from '@/features/script-engine/i18n'
import { dashboardEs, dashboardEn } from '@/features/dashboard/i18n'

const stored = typeof window !== 'undefined' ? window.localStorage.getItem('lang') : null

i18n.use(initReactI18next).init({
  resources: {
    es: {
      common: commonEs,
      user: userEs,
      account: accountEs,
      banking: bankingEs,
      conciliation: conciliationEs,
      'script-engine': scriptEngineEs,
      dashboard: dashboardEs,
    },
    en: {
      common: commonEn,
      user: userEn,
      account: accountEn,
      banking: bankingEn,
      conciliation: conciliationEn,
      'script-engine': scriptEngineEn,
      dashboard: dashboardEn,
    },
  },
  lng: stored ?? 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export default i18n
```

- [ ] **Step 3: Update `useTranslation` calls across features**

For each component in `features/<X>/`, add the namespace:

```tsx
const { t } = useTranslation('account')  // was: useTranslation()
```

Mechanical replacement per feature folder:
- `features/user/` → `useTranslation('user')`
- `features/account/` → `useTranslation('account')`
- `features/banking/` → `useTranslation('banking')`
- `features/conciliation/` → `useTranslation('conciliation')`
- `features/script-engine/` → `useTranslation('script-engine')`
- `features/dashboard/` → `useTranslation('dashboard')`

For `shared/layout/` (AppLayout, LanguageSelector): keep `useTranslation('common')` for nav/enums.

Within each feature, also strip the prefix from keys: `t('accounts.colName')` → `t('accounts.colName')` still works because the JSON kept the prefix; if you want to flatten, you can drop the outer key (`{"accounts": {...}}` → just the inner content) and use `t('colName')`. **Keep prefixed for this refactor — less churn.**

- [ ] **Step 4: Delete the old central i18n**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
rm -rf src/i18n
```

If anything still imports `@/i18n`, update to `@/shared/i18n`. Also remove the temporary re-export added in Task 2:

Edit `client/src/shared/i18n/index.ts` — the version from Step 2 above already replaces the temporary re-export. Confirm no `export { default } from '@/i18n'` lines remain.

Search for stale imports:
```bash
grep -rn "from '@/i18n'" src --include='*.ts' --include='*.tsx' || echo "OK"
```

- [ ] **Step 5: Verify language switching still works**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm lint && pnpm typecheck:test && pnpm build && pnpm test
```

```bash
cd /home/ignacio/workspace/reconbanker && bash setup.sh &
```

Open `http://localhost:5173`, switch the language with `LanguageSelector`, verify keys translate in: nav (common), Login (user), Accounts (account), Dashboard (dashboard).

Kill:
```bash
pkill -f 'tsx watch' && pkill -f 'vite'
```

- [ ] **Step 6: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/src && \
git commit -m "Split i18n into per-feature namespaces"
```

---

## Task 11: Add unit tests for hooks and feature smokes

**Files:**
- Create: `client/src/features/user/hooks/useUser.test.ts`
- Create: `client/src/features/account/hooks/useAccounts.test.ts`
- Create: `client/src/features/account/pages/Accounts.test.tsx`
- Create: `client/src/features/banking/pages/BankMovements.test.tsx`
- Create: `client/src/features/conciliation/pages/Conciliations.test.tsx`
- Create: `client/src/features/script-engine/pages/Scripts.test.tsx`
- Create: `client/tests/msw/handlers/{user,account,banking,conciliation,scriptEngine}.ts`
- Create: `client/tests/utils/render.tsx` (helper that wraps with providers)

- [ ] **Step 1: Create the render helper**

`client/tests/utils/render.tsx`:
```tsx
import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/user/providers/AuthProvider'

interface Options {
  initialEntries?: string[]
  authenticated?: boolean
}

export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  if (opts.authenticated !== false) {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('user', JSON.stringify({ id: 'u-1', email: 'test@x', name: 'T' }))
  } else {
    localStorage.clear()
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <Wrap entries={opts.initialEntries ?? ['/']}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{ui}</AuthProvider>
      </QueryClientProvider>
    </Wrap>
  )
}

function Wrap({ entries, children }: { entries: string[]; children: ReactNode }) {
  return <MemoryRouter initialEntries={entries}>{children}</MemoryRouter>
}
```

- [ ] **Step 2: Create MSW handlers per feature**

`client/tests/msw/handlers/user.ts`:
```ts
import { http, HttpResponse } from 'msw'

export const userHandlers = [
  http.get('http://localhost:3000/me', () =>
    HttpResponse.json({ id: 'u-1', email: 'test@x', name: 'T', operation_mode: 'passthrough' })
  ),
]
```

`client/tests/msw/handlers/account.ts`:
```ts
import { http, HttpResponse } from 'msw'

export const accountHandlers = [
  http.get('http://localhost:3000/accounts', () =>
    HttpResponse.json([
      { id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active' },
    ])
  ),
  http.get('http://localhost:3000/banks', () =>
    HttpResponse.json([
      { id: 'b-1', code: 'mi-dinero', name: 'Mi Dinero', loginUrl: null, status: 'ready' },
    ])
  ),
  http.post('http://localhost:3000/accounts', () =>
    HttpResponse.json({ id: 'a-2' }, { status: 201 })
  ),
]
```

`client/tests/msw/handlers/banking.ts`:
```ts
import { http, HttpResponse } from 'msw'

export const bankingHandlers = [
  http.get('http://localhost:3000/accounts/:accountId/movements', () =>
    HttpResponse.json([
      {
        id: 'm-1', externalId: 'ext-1', amount: 100, currency: 'ARS',
        senderName: 'Alice', receivedAt: '2026-05-17T10:00:00Z',
        notifiedAt: null, excludedAt: null,
      },
    ])
  ),
]
```

`client/tests/msw/handlers/conciliation.ts`:
```ts
import { http, HttpResponse } from 'msw'

export const conciliationHandlers = [
  http.get('http://localhost:3000/conciliation', () =>
    HttpResponse.json([
      {
        id: 'c-1', accountId: 'a-1', externalId: 'ord-1',
        expectedAmount: 100, currency: 'ARS', senderName: 'Alice',
        status: 'pending', retryCount: 0, lastCheckedAt: null,
        createdAt: '2026-05-17T10:00:00Z', bank: 'mi-dinero', accountName: 'Cuenta 1',
      },
    ])
  ),
]
```

`client/tests/msw/handlers/scriptEngine.ts`:
```ts
import { http, HttpResponse } from 'msw'

export const scriptEngineHandlers = [
  http.get('http://localhost:3000/scripts', () =>
    HttpResponse.json([
      {
        id: 's-1', bank: 'mi-dinero', flowType: 'extract_transactions',
        version: '2.0.1', status: 'active', origin: 'system',
        createdAt: '2026-05-17T10:00:00Z',
      },
    ])
  ),
]
```

- [ ] **Step 3: Write test for `useUser`**

`client/src/features/user/hooks/useUser.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { useUser } from './useUser'

describe('useUser', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token')
    server.use(...userHandlers)
  })

  it('maps operation_mode → operationMode', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUser(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({
      id: 'u-1', email: 'test@x', name: 'T', operationMode: 'passthrough',
    })
  })
})
```

- [ ] **Step 4: Run it**

```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm test src/features/user/hooks/useUser.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Test for `useAccounts`**

`client/src/features/account/hooks/useAccounts.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { useAccounts } from './useAccounts'

describe('useAccounts', () => {
  beforeEach(() => { server.use(...accountHandlers) })

  it('returns accounts in camelCase shape', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useAccounts(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual([
      { id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active' },
    ])
  })
})
```

Run:
```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm test src/features/account/hooks/useAccounts.test.ts
```

Expected: 1 test passes.

- [ ] **Step 6: Smoke test for `Accounts.tsx`**

`client/src/features/account/pages/Accounts.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Accounts } from './Accounts'

describe('Accounts page', () => {
  beforeEach(() => { server.use(...accountHandlers) })

  it('renders the list of accounts from the API', async () => {
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })
  })
})
```

Run:
```bash
cd /home/ignacio/workspace/reconbanker/client && \
pnpm test src/features/account/pages/Accounts.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 7: Smoke tests for the other pages**

Repeat the pattern for `BankMovements`, `Conciliations`, `Scripts`. For each, create a `*.test.tsx` next to the page that:
1. Calls `server.use(...featureHandlers)`.
2. Calls `renderWithProviders(<Page />)` (use `initialEntries: ['/movements/some-id']` if the page reads params).
3. Asserts that a known field from the mock appears via `screen.getByText`.

If a page uses `useParams()`, render it inside a route to provide the param:

```tsx
import { Route, Routes } from 'react-router-dom'
renderWithProviders(
  <Routes>
    <Route path="/accounts/:accountId/movements" element={<BankMovements />} />
  </Routes>,
  { initialEntries: ['/accounts/a-1/movements'] }
)
```

- [ ] **Step 8: Run the whole suite**

```bash
cd /home/ignacio/workspace/reconbanker/client && pnpm test
```

Expected: every test written passes; no test fails.

- [ ] **Step 9: Final verification — all checks from spec**

| Check | Command | Expected |
|---|---|---|
| Backend typecheck | `cd /home/ignacio/workspace/reconbanker && pnpm typecheck` | OK |
| Backend unit | `cd /home/ignacio/workspace/reconbanker && pnpm test` | 102/102 |
| Backend integration | `cd /home/ignacio/workspace/reconbanker && pnpm test:integration` | 131/131 |
| Client lint | `cd /home/ignacio/workspace/reconbanker/client && pnpm lint` | 0 errors |
| Client typecheck | `cd /home/ignacio/workspace/reconbanker/client && pnpm typecheck:test` | OK |
| Client build | `cd /home/ignacio/workspace/reconbanker/client && pnpm build` | bundle ok |
| Client tests | `cd /home/ignacio/workspace/reconbanker/client && pnpm test` | all pass |

Run each.

- [ ] **Step 10: Smoke manual end-to-end**

```bash
cd /home/ignacio/workspace/reconbanker && bash setup.sh
```

Visit `http://localhost:5173`, log in, navigate to every page, create an account, set operation mode, verify dashboard. Confirm no console errors.

```bash
pkill -f 'tsx watch' && pkill -f 'vite'
```

- [ ] **Step 11: Commit**

```bash
cd /home/ignacio/workspace/reconbanker && \
git add client/ && \
git commit -m "Add unit tests for hooks, mappers and feature smokes"
```

- [ ] **Step 12: Push the branch**

```bash
cd /home/ignacio/workspace/reconbanker && \
git push -u origin refactor/frontend-feature-modules
```

PR link will be printed by the push. Open it for review.

---

## Self-Review

**Spec coverage:**
- Estructura de carpetas → Tasks 2–8 (each creates one feature folder under `features/`, plus Task 2 for `shared/`)
- Capa `api/` por feature → Tasks 3–7 (one `api/` per feature)
- Hooks por feature → Tasks 3–7
- Mapeo snake↔camel → Task 4 (accountConfig is the rich case; Tasks 5–7 have pass-through mappers because backend already returns camelCase per refactor done in Phase 1–2)
- Routing por feature + shells → Task 9 + Task 3 (PublicShell/ProtectedShell created in Task 2)
- i18n por namespace → Task 10
- Tests → Tasks 1 + 4 (first test) + 11
- Verificación end-to-end → Task 11, Step 9
- Commits previstos (11) → matches Tasks 1–11

**Placeholder scan:** No "TBD", "TODO" except the deliberate marker `_legacy/` in Task 2 which is **deleted** in Task 3, Step 12. One forward reference (`useSetOperationMode`'s cross-feature invalidations) handled explicitly with a Task 3 note and Task 9 fix.

**Type consistency:**
- `accountsQueryKey` defined in Task 4 Step 7, imported in Task 9 Step 3 ✓
- `conciliationsQueryKey` defined in Task 6 Step 3, imported in Task 9 Step 3 ✓
- `bankMovementsQueryKey` is a function — Task 9 Step 3 uses the literal `['bank-movements']` to invalidate all variants. ✓
- `httpClient` (renamed from `api`) used consistently from Task 2 onward ✓
- `AuthProvider`/`useAuth` in Task 3 + Task 9's `App.tsx` ✓

Plan complete and saved to `docs/superpowers/plans/2026-05-17-frontend-feature-modules.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
