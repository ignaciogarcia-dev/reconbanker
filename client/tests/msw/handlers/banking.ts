import { http, HttpResponse } from 'msw'

export const bankingHandlers = [
  http.get('/api/accounts/:accountId/movements', () =>
    HttpResponse.json([
      {
        id: 'm-1',
        externalId: 'ext-1',
        amount: 100,
        currency: 'ARS',
        senderName: 'Alice',
        receivedAt: '2026-05-17T10:00:00Z',
        notifiedAt: null,
        excludedAt: null,
      },
    ])
  ),
]
