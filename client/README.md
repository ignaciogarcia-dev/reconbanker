# ReconBanker — Client

React 19 + TypeScript + Vite frontend.

## Dev

```bash
pnpm install
pnpm dev       # http://localhost:5173
```

Requires the backend running on port 3000. See the [root README](../README.md) for full setup.

## Features

- Login / register, account list, and conciliation request views
- Per-account config form, including bank **session settings** (`sessionType`: one-shot / persistent, `loginMode`: simple / assisted)
- **Needs-attention** badge on the account list when a fatal failure has blocked an account, and a **restart** action on the account config page to unblock it
- Bank and script management
- Feature-scoped i18n (i18next)

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server with HMR |
| `pnpm build` | Type-check and build for production |
| `pnpm preview` | Preview the production build |
| `pnpm lint` | Run ESLint |
