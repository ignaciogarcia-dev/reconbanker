# Spec: Inyección de OTP, bus de eventos y modo API para scraping bancario

> Estado: **borrador para revisión**. Fecha: 2026-06-12. Branch base: `chore/ci-hardening`.

## 1. Problema y objetivo

El login de Banco Pichincha (Azure AD B2C) exige un código SMS (OTP) tras enviar
usuario/contraseña. Hoy:

- `runMonitor` solo hace polling de `hooks.isAuthenticated(page)` durante `authTimeoutMs`
  (`src/contexts/script-engine/infrastructure/runMonitor.ts:74-82`).
- El script `extract_transactions.v1.0.1.js` **no maneja la página OTP**: asume que alguien
  ya autenticó en el navegador.
- `PersistentPlaywrightRunner.ts:33` lanza Chromium con `headless: isHeadless()`, que depende
  **solo de la env `PLAYWRIGHT_HEADLESS`**, NO de `loginMode`. `assisted` únicamente sube el
  `authTimeoutMs` a 300s (`PersistentPlaywrightRunner.ts:61`).

Consecuencia: en un deploy headless, "assisted" espera 300s por un humano que **no puede ver el
navegador** → la sesión muere en `auth_timeout`. Hay dependencia total de un humano frente a un
Chromium visible.

**Objetivo:** que el **script** localice y llene el campo OTP con un código entregado por:
- (A) un **modal en /accounts** (cuadraditos) que llena un humano, o
- (B) una **API externa** (servidor SMS) vía endpoint versionado con API key.

Esto habilita operación **headless/desatendida**. Arrastra tres piezas: estado durable de
"asistencia requerida", un **bus de eventos** en tiempo real al dashboard, y un **endpoint de
notificación** configurable por cuenta.

Criterio rector: **robustez y durabilidad** (debe sobrevivir a separar API y workers en
procesos/máquinas distintas), no la solución más simple.

## 2. Decisiones confirmadas con el usuario

| Tema | Decisión |
|---|---|
| Modelo OTP | El **script llena el OTP** → habilita headless |
| Transporte código (point-to-point) | **Redis Streams** (consumer group, ack, replay) |
| Estado durable de asistencia | Nueva tabla **`assistance_requests`** |
| Realtime UI | **WebSocket bidireccional**, alimentado por el bus |
| Auth WebSocket | **JWT corto vía ticket de un solo uso** (subprotocol; no token en URL) |
| Formato OTP | **Configurable por script** (el script pasa `length`/`type` en `requestOtp`) |
| Timeout OTP | **Reintento indefinido con backoff** (re-pide SMS); sin fallo duro |
| Endpoint notificación | **Uno por cuenta**, con su auth y **filtro por evento** |
| Eventos notificados (v1) | `assistance_required`. Extensible a login/credenciales fallidas |
| Modo "api" | **Capacidad ortogonal** (no toca `operationMode`) |
| Auth API externa | **API keys con scopes** (`otp:write`, `status:read`), opcional por cuenta |
| Gestión API keys | En **Settings**: crear/listar/revocar; secreto visible una sola vez |
| Acciones /v1 | **Inyectar OTP** + **consultar estado** |

## 3. Arquitectura

```
                       ┌──────────────────────────── proceso(s) API/worker ───────────────────────────┐
Script (Pichincha)     │                                                                               │
  login() → submit     │   SessionManager.startFn → PersistentPlaywrightRunner → runMonitor            │
  detecta página OTP   │        │                                                                      │
  await context        │        │  requestOtp({length,type})  (callback inyectado en MonitorScriptCtx) │
    .requestOtp(...) ──┼────────┘     1. assistance_requests UPSERT (pending, attempts++)              │
                       │              2. publica evento "assistance.requested"                         │
                       │                   ├─ pub/sub  events:user:<id>  → WS gateway → dashboards      │
                       │                   └─ XADD     notify-stream      → Notifier → POST webhook     │
                       │              3. XREADGROUP BLOCK  otp:req:<reqId>  (ventana N ms)              │
                       │                   ├─ recibe código → lo retorna → script llena campo y envía   │
                       │                   └─ timeout → re-dispara SMS, backoff, vuelve a (1)           │
                       └───────────────────────────────────────────────────────────────────────────────┘
Entrada del código (mismo destino XADD otp:req:<reqId>):
  A) Humano:       modal /accounts → POST /api/accounts/:id/otp   (JWT, dueño de la cuenta)
  B) Servidor SMS: POST /v1/accounts/:id/otp                      (API key, scope otp:write)
```

**Semántica del bus (corrección importante respecto al plan inicial):**
- **Entrega del OTP** (point-to-point a la única sesión que espera) → **Redis Streams** con
  consumer group: exactly-once, durable, con ack. Clave **por request**: `otp:req:<reqId>` para
  que un código viejo nunca caiga en una request nueva.
- **Notifier** (cada notificación se envía una vez) → **Redis Streams** + consumer group.
- **Fan-out al dashboard** (un evento debe llegar a *todas* las conexiones WS del usuario, que
  pueden estar en distintas instancias) → **Redis pub/sub** (`events:user:<id>`). Un consumer
  group de Streams entregaría el evento a *una sola* instancia, no a todas → no sirve para
  broadcast. Pub/sub es la semántica correcta aquí.

Estado durable en DB (lo leen UI y notifier); el **código nunca se persiste** — solo transita el
stream (con `MAXLEN` pequeño).

## 4. Componentes

### 4.1 Motor de scraping (script-engine)
- `MonitorScriptContext` (`runMonitor.ts:28-34`): agregar
  `requestOtp?(d: { length: number; type: 'numeric' | 'alphanumeric'; purpose?: string }): Promise<string>`.
  El motor solo declara la firma; la implementación se inyecta desde banking → script-engine
  permanece sin dependencias de Redis/DB.
- `PersistentRunnerInput` (`PersistentPlaywrightRunner.ts:5-13`): propagar `requestOtp` al
  `context` que se pasa a `runMonitor`.
- **Headless**: ningún cambio de toggle. Con el script llenando el OTP, assisted funciona headless
  por defecto; `PLAYWRIGHT_HEADLESS=false` queda como fallback manual documentado.

### 4.2 Script Pichincha `v1.0.2` (nuevo, no se toca v1.0.1)
- Tras el submit en `login()`, detectar la pantalla OTP de B2C (input de código; selector a
  confirmar contra el SMS real — p.ej. `#otpCode`, `input[autocomplete="one-time-code"]`,
  o el id de la policy B2C). Declarar descriptor (`{ length: 6, type: 'numeric' }` por defecto).
- `const code = await context.requestOtp({ length: 6, type: 'numeric' })` → llenar el input,
  enviar, continuar al dashboard.
- **Reintento indefinido**: la política de reintento vive en `OtpAssistanceCoordinator` (banking),
  no en el script. El script solo aporta un hook `onResend` que sabe re-disparar el SMS en la
  página (botón "reenviar"). El coordinador espera por ventanas de `OTP_WAIT_WINDOW_MS`; al
  expirar una ventana invoca `onResend` hasta `OTP_MAX_RESENDS` veces y después sigue esperando
  indefinidamente sin reenviar (la espera es un `XREADGROUP BLOCK`, barata). `requestOtp` nunca
  lanza fallo duro.
- Si `context.requestOtp` es `undefined` (script viejo / runner sin soporte), fallback al
  comportamiento actual (esperar autenticación manual) → compat hacia atrás.
- Seeding vía migración (como `038_seed_pichincha_script_v1_0_1.sql`), **inactivo**; activación
  es un paso separado (igual que el commit "Activate Banco Pichincha script v1.0.1").

### 4.3 Tabla `assistance_requests` + repo
Migración `039_create_assistance_requests.sql`. Columnas:
`id uuid pk`, `account_id uuid fk`, `session_id uuid null`, `type text` ('otp'),
`status text` ('pending'|'fulfilled'|'expired'|'cancelled'), `descriptor jsonb`,
`attempts int default 0`, `created_at`, `updated_at`, `fulfilled_at null`.
Índice parcial `UNIQUE (account_id) WHERE status='pending'` (una asistencia pendiente por cuenta).
Repo `AssistanceRequestRepository` en banking, patrón de `AccountConfigRepository.ts`.
**No** almacena el código.

### 4.4 Bus de eventos (`src/shared/infrastructure/events/`)
- Reusar `redis` de `QueueRegistry.ts`. Un segundo cliente `ioredis` dedicado para
  `subscribe`/`XREADGROUP BLOCK` (no se puede multiplexar el de comandos en modo bloqueante).
- API del módulo:
  - `publishUserEvent(userId, event)` → `PUBLISH events:user:<id>`.
  - `subscribeUserEvents(handler)` → para el WS gateway.
  - `openOtpWaiter(reqId)` → waiter sobre `otp:req:<reqId>`; `waiter.next(windowMs)` hace
    `XREADGROUP BLOCK windowMs` y resuelve con el código o `null` si la ventana expira (el
    reintento lo decide el coordinador, no el bus).
  - `submitOtpCode(reqId, code)` → `XADD otp:req:<reqId> * code <code>` con `MAXLEN ~ 5`.
  - `enqueueNotification(event)` → `XADD` a `notify-stream` (consumido por el Notifier).
- Define el enum de eventos: `assistance.requested`, `assistance.fulfilled`,
  `assistance.cancelled`, (futuro) `login.failed`, `scrape.failed`, `scrape.succeeded`,
  `session.started`, `session.stopped`.

### 4.5 WebSocket gateway + ticket
- Dependencia nueva: **`ws`** + `@types/ws` (Express 5 no trae WS). Confirmado: no está en
  `package.json`.
- Montar un `WebSocketServer` sobre el `http.Server` de `src/index.ts` (usar `server.listen` y
  `noServer` + `upgrade`). Ruta lógica `/realtime`.
- **Auth por ticket**: `POST /api/realtime/ticket` (protegido por JWT normal) emite un JWT corto
  (~30s, `scope: 'ws'`) con `JwtTokenIssuer`. El browser abre el WS pasando el ticket por
  `Sec-WebSocket-Protocol`. El gateway lo valida en el handshake `upgrade`, resuelve `userId`,
  y `subscribeUserEvents` filtrando por ese usuario.
- Reconexión: el cliente re-pide ticket y reconecta con backoff.

### 4.6 Frontend (React)
- `useRealtime()` (`client/src/shared/`): pide ticket, abre WS, emite eventos; ante
  `assistance.requested` invalida `accountsQueryKey` y guarda el descriptor para abrir el modal.
- `/accounts` (`Accounts.tsx`): badge "Asistencia requerida" (patrón `Badge`) en la fila;
  click abre el modal de OTP.
- `OtpInput` (nuevo, `client/src/shared/ui/`): cuadraditos segmentados (no existe; el más cercano
  es el input TOTP en `TwoFactorSection.tsx:164`). Longitud/tipo del descriptor del evento.
- Submit → `POST /api/accounts/:id/otp`. i18n: nuevas claves en los catálogos i18next.

### 4.7 Endpoint interno de OTP
- `POST /api/accounts/:accountId/otp` (JWT) en `accounts.routes.ts`: valida que el usuario es
  dueño de la cuenta y que hay `assistance_requests` pendiente; `submitOtpCode(reqId, code)`;
  marca `fulfilled`. **Rate limit** por cuenta (anti fuerza bruta).

### 4.8 Notificación por cuenta
- Extender `account_config` (migración `040_account_config_notification_endpoint.sql`):
  `notification_endpoint_url text null`, `notification_auth_type text null`
  ('bearer'|'api_key'), `notification_auth_token text null` (cifrado con `credentialsCipher()`),
  `notification_events jsonb null` (filtro).
  Actualizar `AccountConfig.ts`, `AccountConfigInput`, `AccountConfigRepository.ts`
  (INSERT/UPDATE + `decryptConfig`), `AccountConfigRowMapper`, y la UI/PUT de
  `/api/accounts/:accountId/config`.
- **Notifier**: consumer del `notify-stream`. Lee la config de la cuenta; si el evento está en
  `notification_events`, hace POST reutilizando **`WebhookSender.sendWebhook()`**
  (`src/shared/infrastructure/webhooks/WebhookSender.ts:24-50`) y la cola `webhook` existente para
  retries/backoff/dead-letter. Payload: `{ account_id, type, status, error?, occurred_at }`.

### 4.9 API keys + scopes
- Migración `041_create_api_keys.sql`: `id`, `user_id`, `name`, `prefix text`,
  `hash text` (clave hasheada con sha-256/HMAC; nunca en claro), `scopes jsonb`,
  `account_ids jsonb null` (null = todas), `created_at`, `last_used_at null`, `revoked_at null`.
- `buildApiKeyMiddleware` (`src/api/middlewares/apiKey.middleware.ts`), paralelo a
  `auth.middleware.ts:15-48`: lee `Authorization: Api-Key <key>` (o `X-Api-Key`), valida hash,
  `revoked_at`, scopes y `account_ids`. Actualiza `last_used_at`.
- CRUD `POST/GET/DELETE /api/me/api-keys` (JWT). UI: nueva sección en `SettingsDialog.tsx`
  (patrón de tabs/mutaciones). Secreto mostrado una sola vez. Tipos en `client/.../user/types`.

### 4.10 API externa `/v1` (capacidad "api")
- Router `/v1` montado en `bindRoutes.ts`, protegido por `buildApiKeyMiddleware`:
  - `POST /v1/accounts/:accountId/otp` — scope `otp:write` + cuenta permitida → misma lógica que
    el endpoint interno (`submitOtpCode` + `fulfilled`).
  - `GET /v1/accounts/:accountId/status` — scope `status:read` → estado de `bank_sessions` +
    `assistance_requests` pendiente.
- "Ortogonal": **no** se toca el enum `operationMode`. La habilitación es la existencia de una
  API key con scope. Documentado para no confundir con un tercer `operationMode`.

## 5. Migraciones nuevas (desde 039)
1. `039_create_assistance_requests.sql`
2. `040_account_config_notification_endpoint.sql`
3. `041_create_api_keys.sql`
4. `042_seed_pichincha_script_v1_0_2.sql` (inactivo)

## 6. Variables de entorno nuevas
- `OTP_WAIT_WINDOW_MS` (default 120000) — ventana de cada espera antes de re-pedir SMS.
- `OTP_MAX_RESENDS` (default 3) — reenvíos automáticos de SMS antes de solo-esperar.
- `WS_TICKET_TTL_SECONDS` (default 30).
- (Reusar `PLAYWRIGHT_HEADLESS`, `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `REDIS_URL`.)

## 7. Dependencias nuevas
- `ws` + `@types/ws`.

## 8. Decisiones (antes huecos) — resueltas

1. **Fan-out WS = pub/sub; OTP/notifier = Streams** (ver §3). **Resuelto: adoptado.**
2. **Correlación código↔request por `otp:req:<reqId>`** para evitar inyectar códigos viejos.
   **Resuelto: adoptado.**
3. **Reintento indefinido sin quemar recursos.** La espera (`XREADGROUP BLOCK`) es barata → se
   **espera indefinidamente sin fallo**. Lo caro es reenviar SMS → se **capea el reenvío
   automático a `OTP_MAX_RESENDS` (default 3)**; tras N reenvíos se deja de auto-reenviar pero la
   sesión **sigue esperando** un código que llegue por modal/API. **Resuelto.**
4. **Anti fuerza bruta del OTP:** rate-limit **5 envíos / 10 min por cuenta** en
   `/api/accounts/:id/otp` y `/v1/.../otp`, + registro de `attempts`. **Resuelto.**
5. **Cancelación / limpieza:** si la sesión cae esperando OTP, marcar la request
   `cancelled`/`expired` y emitir evento para limpiar la alerta. **Resuelto: incluido.**
6. **Selector real del campo OTP de Pichincha (B2C).** `v1.0.2` usa **detección multi-selector
   robusta** (`#otpCode`, `input[autocomplete="one-time-code"]`, `input[inputmode="numeric"]`,
   ids comunes de la policy B2C) con TODO para confirmar contra un SMS real. No bloquea backend/
   infra/frontend. **Resuelto (best-effort, pendiente verificación con SMS real).**
7. **One-shot vs persistente:** Pichincha corre **solo** persistente (`startFn` usa
   `PersistentPlaywrightRunner`). Replicar el callback en `PlaywrightRunner` queda **fuera de
   alcance** hasta que un banco con OTP corra one-shot.
8. **Seguridad del código:** nunca persistido; stream con `MAXLEN`; TLS en prod para ticket/WS;
   `account_ids` acota las API keys.
9. **Compat hacia atrás:** `requestOtp` opcional; `v1.0.1` sigue válido; `v1.0.2` se siembra
   inactivo y se activa aparte.

## 9. Verificación
1. Migraciones aplican limpio.
2. **Unit:** `runMonitor`/wiring con `requestOtp` mock resuelve el código; ventana expirada
   dispara `onResend` hasta el cap y luego sigue esperando (sin fallo). Repo `assistance_requests`. Middleware API key
   (scope, cuenta acotada, key revocada → 401/403). Notifier (filtro de eventos). `OtpInput`.
3. **Integración OTP humano:** forzar scrape Pichincha; /accounts muestra alerta y abre modal;
   ingresar código → autentica y pollea; request → `fulfilled`.
4. **Integración OTP API:** API key `otp:write` → `POST /v1/accounts/:id/otp` autentica igual;
   sin scope → 403.
5. **Notificación:** endpoint de cuenta suscrito a `assistance_required`; al requerirse OTP, POST
   saliente con payload correcto y auth en header (receptor de prueba).
6. **WebSocket:** dos pestañas en /accounts reciben el evento en tiempo real; ticket
   inválido/expirado → handshake rechazado.
7. **Headless:** repetir (3) con `PLAYWRIGHT_HEADLESS=true` (default) → ya no requiere navegador
   visible.
