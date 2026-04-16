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
{ "token": "<jwt>" }
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
{ "token": "<jwt>" }
```

---

## Banks

### GET /banks

Returns all banks.

**Response** `200`
```json
[
  { "id": "uuid", "code": "itau", "name": "Itaú", "loginUrl": "https://...", "status": "active" }
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

Returns all accounts.

---

### POST /accounts

Create an account.

**Body**
```json
{
  "bankId": "uuid",
  "name": "Main account"
}
```

---

### GET /accounts/:accountId/config

Returns the account's reconciliation configuration.

**Response** `200`
```json
{
  "pendingOrdersEndpoint": "https://erp.example.com/orders/pending",
  "webhookUrl": "https://erp.example.com/webhooks/reconbanker",
  "pollingMethod": "GET",
  "authType": "bearer",
  "webhookAuthType": "bearer",
  "webhookAuthToken": "..."
}
```

---

### PUT /accounts/:accountId/config

Create or update account configuration.

**Body** - same shape as config response above.

---

### POST /accounts/:accountId/scrape

Trigger a manual bank scrape for this account.

**Response** `202`
```json
{ "jobId": "..." }
```

---

## Conciliation

### GET /conciliation

Returns conciliation requests. Supports pagination and status filtering.

**Query params**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status: `pending`, `matched`, `ambiguous`, `failed` |
| `page` | number | Page number (default 1) |
| `limit` | number | Results per page (default 20) |

---

### GET /conciliation/:requestId

Returns a single request with attempt history and matched transaction (if any).

---

### POST /conciliation/:requestId/run

Trigger a manual reconciliation run for a specific request.

**Response** `202`
```json
{ "jobId": "..." }
```

---

### POST /conciliation/poll/:accountId

Trigger a manual order poll for an account.

**Response** `202`
```json
{ "jobId": "..." }
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

Returns `200 OK` - no authentication required. Used for liveness checks.
