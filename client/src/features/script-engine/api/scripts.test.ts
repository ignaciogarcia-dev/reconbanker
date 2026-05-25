import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { listScripts, promoteScript } from './scripts'

describe('scripts api', () => {
  it('listScripts returns the raw payload from the API', async () => {
    server.use(
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
      )
    )
    const out = await listScripts()
    expect(out[0].id).toBe('s-1')
  })

  it('promoteScript POSTs to /scripts/:id/promote', async () => {
    let called = false
    server.use(
      http.post('/api/scripts/s-1/promote', () => {
        called = true
        return HttpResponse.json({ ok: true })
      })
    )
    await promoteScript('s-1')
    expect(called).toBe(true)
  })
})
