import { http, HttpResponse } from 'msw'

export const accountHandlers = [
  http.get('/api/accounts', () =>
    HttpResponse.json([
      { id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active' },
    ])
  ),
  http.get('/api/banks', () =>
    HttpResponse.json([
      { id: 'b-1', code: 'mi-dinero', name: 'Mi Dinero', loginUrl: null, status: 'ready' },
    ])
  ),
  http.post('/api/accounts', () =>
    HttpResponse.json({ id: 'a-2' }, { status: 201 })
  ),
  http.get('/api/accounts/:accountId', ({ params }) =>
    HttpResponse.json({
      id: params.accountId,
      bank: 'mi-dinero',
      name: 'Cuenta 1',
      status: 'active',
    })
  ),
  http.get('/api/accounts/:accountId/config', ({ params }) =>
    HttpResponse.json({
      id: 'cfg-1',
      account_id: params.accountId,
      pending_orders_endpoint: null,
      webhook_url: '',
      retry_limit: 3,
      polling_method: 'GET',
      polling_body: null,
      auth_type: 'bearer',
      auth_token: null,
      webhook_auth_type: null,
      webhook_auth_token: null,
      notify_on_expired: false,
      webhook_extra_fields: null,
      silent_ingestion: false,
      session_type: 'one-shot',
      login_mode: 'simple',
      bank_username: null,
    })
  ),
  http.delete('/api/accounts/:accountId', () => HttpResponse.json({ ok: true })),
  http.post('/api/accounts/:accountId/scrape', () =>
    HttpResponse.json({ queued: true })
  ),
  http.put('/api/accounts/:accountId/config', async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      id: 'cfg-1',
      account_id: params.accountId,
      pending_orders_endpoint: body.pending_orders_endpoint ?? null,
      webhook_url: body.webhook_url ?? '',
      retry_limit: body.retry_limit ?? 3,
      polling_method: body.polling_method ?? 'GET',
      polling_body: body.polling_body ?? null,
      auth_type: body.auth_type ?? 'bearer',
      auth_token: body.auth_token ?? null,
      webhook_auth_type: body.webhook_auth_type ?? null,
      webhook_auth_token: body.webhook_auth_token ?? null,
      notify_on_expired: body.notify_on_expired ?? false,
      webhook_extra_fields: body.webhook_extra_fields ?? null,
      silent_ingestion: body.silent_ingestion ?? false,
      session_type: body.session_type ?? 'one-shot',
      login_mode: body.login_mode ?? 'simple',
      bank_username: body.bank_username ?? null,
    })
  }),
]
