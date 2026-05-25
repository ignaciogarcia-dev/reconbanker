import { http, HttpResponse } from 'msw'

export const scriptEngineHandlers = [
  http.get('/api/scripts', () =>
    HttpResponse.json([
      {
        id: 's-1',
        bank: 'mi-dinero',
        flowType: 'extract_transactions',
        version: '2.0.1',
        status: 'active',
        origin: 'system',
        createdAt: '2026-05-17T10:00:00Z',
      },
      {
        id: 's-2',
        bank: 'mi-dinero',
        flowType: 'extract_transactions',
        version: '2.0.0',
        status: 'deprecated',
        origin: 'system',
        createdAt: '2026-05-16T10:00:00Z',
      },
    ])
  ),
  http.post('/api/scripts/:scriptId/promote', () =>
    HttpResponse.json({ ok: true })
  ),
]
