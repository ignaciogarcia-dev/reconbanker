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
    ])
  ),
]
