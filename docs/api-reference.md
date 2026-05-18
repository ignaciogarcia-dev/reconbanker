# API Reference

Base URL: `http://localhost:3000`

All routes except `/health`, `/auth/register`, and `/auth/login` require a `Bearer` token in the `Authorization` header.

## Authentication

### POST /auth/register

Register a new user.

**Body**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "name": "Jane Doe"
}
```

**Response** `201`
```json
{ "id": "uuid", "email": "user@example.com" }
```

---

### POST /auth/login

**Body**
```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

**Response** `200`
```json
{
  "token": "<jwt>",
  "user": { "id": "uuid", "email": "user@example.com", "name": "Jane Doe" }
}
```

---

## Current User

### GET /me

Returns the authenticated user and current operation mode.

`operation_mode` is `reconcile`, `passthrough`, or `null` before the user selects a mode.

**Response** `200`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Jane Doe",
  "operation_mode": null
}
```

---

### PUT /me/operation-mode

Switches the user's operation mode.

**Body**
```json
{ "mode": "passthrough" }
```

`mode` must be `reconcile` or `passthrough`.

**Response** `200`
```json
{ "operation_mode": "passthrough" }
```

---

## Banks

### GET /banks

Returns all banks.

`status` can be `pending`, `ready`, or `failed`.

**Response** `200`
```json
[
  { "id": "uuid", "code": "itau", "name": "Itaú", "loginUrl": "https://...", "status": "pending" }
]
```

---

### POST /banks

Create a bank.

**Body**
```json
{
  "code": "itau",
  "name": "Itaú",
  "loginUrl": "https://example.com/login"
}
```

---

### GET /banks/:bankId

Returns bank details including associated scripts.

---

## Accounts

### GET /accounts

Returns accounts for the authenticated user.

---

### POST /accounts

Create an account for the authenticated user.

**Body**
```json
{
  "bankId": "uuid",
  "name": "Main account"
}
```

**Response** `201`

---

### GET /accounts/:accountId

Returns account detail for the authenticated user.

---

### DELETE /accounts/:accountId

Deletes an account after confirmation.

**Body**
```json
{ "confirmation_name": "Main account" }
```

**Response** `204`

---

### GET /accounts/:accountId/config

Returns the account's reconciliation and webhook configuration, or `null` when no config exists.

**Response** `200`
```json
{
  "id": "uuid",
  "account_id": "uuid",
  "pending_orders_endpoint": "https://erp.example.com/orders/pending",
  "webhook_url": "https://erp.example.com/webhooks/reconbanker",
  "retry_limit": 3,
  "polling_method": "GET",
  "polling_body": null,
  "auth_type": "bearer",
  "auth_token": "...",
  "webhook_auth_type": "bearer",
  "webhook_auth_token": "...",
  "notify_on_expired": false,
  "webhook_extra_fields": null,
  "silent_ingestion": false,
  "bank_username": "user"
}
```

---

### PUT /accounts/:accountId/config

Create or update account configuration.

**Body**
```json
{
  "pending_orders_endpoint": "https://erp.example.com/orders/pending",
  "webhook_url": "https://erp.example.com/webhooks/reconbanker",
  "webhook_auth_type": "bearer",
  "webhook_auth_token": "...",
  "retry_limit": 3,
  "polling_method": "POST",
  "polling_body": { "status": "pending" },
  "auth_type": "api_key",
  "auth_token": "...",
  "bank_username": "user",
  "bank_password": "secret",
  "notify_on_expired": false,
  "webhook_extra_fields": { "source": "reconbanker" },
  "silent_ingestion": false
}
```

`webhook_extra_fields` may be a JSON object, a JSON object encoded as a string, or `null`. It cannot override reserved webhook keys such as `external_id`, `status`, `amount`, `currency`, `name`, `id`, or `received_at`.

---

### POST /accounts/:accountId/scrape

Trigger a manual bank scrape for this account.

**Response** `202`
```json
{ "queued": true }
```

---

## Bank Movements

### GET /accounts/:accountId/movements

Returns scraped bank movements for an account. Requires ownership of the account.

**Query params**

| Param | Type | Description |
|---|---|---|
| `limit` | number | Results per page, max 500, default 100 |
| `offset` | number | Offset, default 0 |

---

### POST /accounts/:accountId/movements/:movementId/notify

Re-queues webhook notification for a bank movement. Requires ownership of the account and movement.

**Response** `202`
```json
{ "queued": true }
```

---

## Conciliation

### GET /conciliation

Returns conciliation requests for the authenticated user.

**Query params**

| Param | Type | Description |
|---|---|---|
| `status` | string | Optional status filter: `pending`, `processing`, `matched`, `not_found`, `ambiguous`, `failed`, `expired`, `cancelled` |
| `limit` | number | Results per page, max 500, default 50 |
| `offset` | number | Offset, default 0 |

---

### GET /conciliation/:requestId

Returns a single request with attempt history and matched transaction if available.

---

### POST /conciliation/:requestId/run

Trigger a manual reconciliation run for a specific request.

**Response** `202`
```json
{ "queued": true }
```

---

### POST /conciliation/:requestId/notify

Re-queues webhook notification for a conciliation request.

**Response** `202`
```json
{ "queued": true }
```

---

### POST /conciliation/poll/:accountId

Trigger a manual order poll for an account.

**Response** `202`
```json
{ "queued": true }
```

---

## Scripts

### GET /scripts

Returns all bank scripts.

---

### GET /scripts/:scriptId

Returns script details.

---

### POST /scripts/:scriptId/promote

Promote a script from `review` to `active` status. The previously active script for that bank is deactivated.

---

## Health

### GET /health

Returns `200` with `{ "ok": true }`. No authentication required.
