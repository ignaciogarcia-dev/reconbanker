import { http, HttpResponse } from 'msw'

export const conciliationHandlers = [
  http.get('/api/conciliation', () =>
    HttpResponse.json([
      {
        id: 'c-1',
        accountId: 'a-1',
        externalId: 'ord-1',
        expectedAmount: 100,
        currency: 'ARS',
        senderName: 'Alice',
        status: 'pending',
        retryCount: 0,
        lastCheckedAt: null,
        createdAt: '2026-05-17T10:00:00Z',
        bank: 'mi-dinero',
        accountName: 'Cuenta 1',
      },
    ])
  ),
]
