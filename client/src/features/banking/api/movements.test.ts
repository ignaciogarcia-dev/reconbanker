import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { listBankMovements, reNotifyMovement } from './movements'

describe('movements api', () => {
  it('listBankMovements forwards limit/offset and maps rows', async () => {
    let receivedUrl: URL | null = null
    server.use(
      http.get('/api/accounts/a-1/movements', ({ request }) => {
        receivedUrl = new URL(request.url)
        return HttpResponse.json([
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
      })
    )
    const out = await listBankMovements('a-1', 25, 5)
    expect(receivedUrl).not.toBeNull()
    expect(receivedUrl!.searchParams.get('limit')).toBe('25')
    expect(receivedUrl!.searchParams.get('offset')).toBe('5')
    expect(out).toEqual([
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
  })

  it('listBankMovements uses defaults when limit/offset are omitted', async () => {
    let receivedUrl: URL | null = null
    server.use(
      http.get('/api/accounts/a-1/movements', ({ request }) => {
        receivedUrl = new URL(request.url)
        return HttpResponse.json([])
      })
    )
    await listBankMovements('a-1')
    expect(receivedUrl!.searchParams.get('limit')).toBe('100')
    expect(receivedUrl!.searchParams.get('offset')).toBe('0')
  })

  it('reNotifyMovement POSTs to the renotify endpoint and returns queued', async () => {
    server.use(
      http.post('/api/accounts/a-1/movements/m-1/notify', () =>
        HttpResponse.json({ queued: true })
      )
    )
    await expect(reNotifyMovement('a-1', 'm-1')).resolves.toEqual({ queued: true })
  })
})
