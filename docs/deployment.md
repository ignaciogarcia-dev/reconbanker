# Deployment (VPS)

ReconBanker runs as a single Node process (API + BullMQ workers + scheduler) behind
Nginx, which terminates TLS. PostgreSQL and Redis run on the same host (or a private
network). This guide assumes Ubuntu/Debian.

## 1. Prerequisites

- Node 20+ and `pnpm` (`npm i -g pnpm`)
- PostgreSQL 16 and Redis 7 reachable from the host
- A non-login system user: `sudo useradd --system --home /opt/reconbanker reconbanker`
- Nginx + certbot for TLS

## 2. Generate secrets

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # CREDENTIALS_ENCRYPTION_KEY (must decode to 32 bytes)
```

> Changing `CREDENTIALS_ENCRYPTION_KEY` after go-live makes already-encrypted bank
> credentials and tokens unreadable. Store it safely (e.g. a secrets manager).

## 3. Environment file

Create `/etc/reconbanker/reconbanker.env` (root-owned, `chmod 600`), based on
`.env.example`. Required in production:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET` (>= 32 chars), `CREDENTIALS_ENCRYPTION_KEY` (base64 32 bytes)
- `CORS_ORIGINS` (comma-separated frontend origins)
- `NODE_ENV=production`
- `PLAYWRIGHT_HEADLESS=true` (see step 7 if a bank blocks headless)
- `PGSSLMODE=require` if PostgreSQL is remote

The app runs `validateEnv()` at startup and refuses to boot on missing/weak config.

## 4. Build, migrate, encrypt

```bash
cd /opt/reconbanker
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm migrate
# If upgrading an existing DB that had plaintext credentials, encrypt them once:
pnpm tsx scripts/encrypt-existing-credentials.ts
```

## 5. Create an admin user

Global resources (creating banks, promoting scripts) require an `admin` role. After
registering the operator account through the API, promote it:

```sql
UPDATE users SET role = 'admin' WHERE email = 'operator@example.com';
```

## 6. systemd service

Copy `deploy/reconbanker.service` to `/etc/systemd/system/`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now reconbanker
sudo systemctl status reconbanker
curl -s http://127.0.0.1:3000/health       # liveness: {"ok":true} once the process is up
curl -s http://127.0.0.1:3000/api/health   # readiness: {"ok":true} when DB + Redis are reachable
```

## 7. Playwright headless vs. xvfb

The scrapers default to headless (`PLAYWRIGHT_HEADLESS=true`). If a bank blocks
headless Chromium, run the service under a virtual display instead:

```bash
sudo apt-get install -y xvfb
# In the env file: PLAYWRIGHT_HEADLESS=false
# Wrap ExecStart in the unit file:
#   ExecStart=/usr/bin/xvfb-run -a /usr/bin/node dist/index.js
```

## 8. Nginx + TLS

Use `deploy/nginx.conf.example` as a starting point, then:

```bash
sudo certbot --nginx -d app.example.com
sudo nginx -t && sudo systemctl reload nginx
```

The app sets `trust proxy = 1` and reads `X-Forwarded-For`, so rate limiting and logs
use the real client IP. It also emits HSTS and other security headers via Helmet.

## 9. Operational notes

- Logs rotate daily under `logs/` (`app-*.log`, `error-*.log`, gzipped, 14 days).
- `/health` is liveness (always 200 once the process is up). `/api/health` is
  readiness and returns 503 if PostgreSQL or Redis is down — wire it into your
  monitoring/uptime checks.
- Run `pnpm audit` before each deploy and on a schedule.
- JWTs expire per `JWT_EXPIRES_IN` (default 12h); `POST /api/auth/logout` revokes the
  current token via the Redis denylist.
