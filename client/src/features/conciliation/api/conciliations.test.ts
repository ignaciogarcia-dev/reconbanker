import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import {
  listConciliations,
  getConciliation,
  enqueueRun,
  enqueueNotify,
  enqueuePoll,
} from './conciliations'

describe('conciliations api', () => {
  it('listConciliations forwards default limit/offset when no filter is given', async () => {
    let receivedUrl: URL | null = null
    server.use(
      http.get('/api/conciliation', ({ request }) => {
        receivedUrl = new URL(request.url)
        return HttpResponse.json([])
      })
    )
    await listConciliations()
    expect(receivedUrl!.searchParams.get('limit')).toBe('50')
    expect(receivedUrl!.searchParams.get('offset')).toBe('0')
    expect(receivedUrl!.searchParams.get('status')).toBeNull()
  })

  it('listConciliations forwards explicit filter values', async () => {
    let receivedUrl: URL | null = null
    server.use(
      http.get('/api/conciliation', ({ request }) => {
        receivedUrl = new URL(request.url)
        return HttpResponse.json([])
      })
    )
    await listConciliations({ limit: 10, offset: 20, status: 'matched' })
    expect(receivedUrl!.searchParams.get('limit')).toBe('10')
    expect(receivedUrl!.searchParams.get('offset')).toBe('20')
    expect(receivedUrl!.searchParams.get('status')).toBe('matched')
  })

  it('getConciliation returns the detail payload as-is', async () => {
    server.use(
      http.get('/api/conciliation/req-9', () =>
        HttpResponse.json({
          id: 'req-9',
          accountId: 'a-1',
          externalId: 'ord-9',
          expectedAmount: 200,
          currency: 'ARS',
          senderName: null,
          status: 'matched',
          retryCount: 1,
          lastCheckedAt: null,
          createdAt: '2026-05-17T10:00:00Z',
          bank: 'mi-dinero',
          accountName: 'Cuenta 1',
          attempts: [],
          match: null,
        })
      )
    )
    const out = await getConciliation('req-9')
    expect(out.id).toBe('req-9')
    expect(out.status).toBe('matched')
  })

  it('enqueueRun POSTs to /:requestId/run', async () => {
    server.use(
      http.post('/api/conciliation/req-1/run', () =>
        HttpResponse.json({ queued: true })
      )
    )
    await expect(enqueueRun('req-1')).resolves.toEqual({ queued: true })
  })

  it('enqueueNotify POSTs to /:requestId/notify', async () => {
    server.use(
      http.post('/api/conciliation/req-1/notify', () =>
        HttpResponse.json({ queued: true })
      )
    )
    await expect(enqueueNotify('req-1')).resolves.toEqual({ queued: true })
  })

  it('enqueuePoll POSTs to /poll/:accountId', async () => {
    server.use(
      http.post('/api/conciliation/poll/a-1', () =>
        HttpResponse.json({ queued: true })
      )
    )
    await expect(enqueuePoll('a-1')).resolves.toEqual({ queued: true })
  })
})
