import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createServer } from './server.js'
import type { Container } from '../composition/container.js'

vi.mock('../shared/infrastructure/queues/BankScrapeQueue.js', () => ({
  enqueueBankScrape: vi.fn(),
}))

vi.mock('../shared/infrastructure/queues/QueueRegistry.js', () => ({
  Queues: {
    orderIngestion: { add: vi.fn() },
    conciliation: { add: vi.fn() },
    webhook: { add: vi.fn() },
  },
}))

function fakeContainer(): Container {
  return {
    user: {
      tokenIssuer: {
        verify: () => null,
      },
    },
    account: {
      accountRepository: {},
    },
    banking: {},
    conciliation: {},
    scriptEngine: {},
  } as unknown as Container
}

describe('createServer routing', () => {
  it('serves api health without authentication', async () => {
    const res = await request(createServer(fakeContainer())).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('protects api routes under /api', async () => {
    const res = await request(createServer(fakeContainer())).get('/api/accounts')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('returns json not found for unknown api routes', async () => {
    const res = await request(createServer(fakeContainer())).get('/api/unknown')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it.each(['/', '/banks', '/accounts'])(
    'serves the spa fallback without authentication for %s',
    async (route) => {
      const res = await request(createServer(fakeContainer())).get(route)

      expect(res.status).toBe(200)
      expect(res.type).toContain('html')
      expect(res.text).toContain('<!doctype html>')
    }
  )
})
