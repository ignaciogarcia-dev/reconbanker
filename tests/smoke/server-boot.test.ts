import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createServer } from '../../src/api/server.js'
import { buildContainer } from '../../src/composition/container.js'

describe('server boot (smoke)', () => {
  it('GET /health returns 200 OK using a built container', async () => {
    const container = buildContainer()
    const app = createServer(container)
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('protected api route returns 401 without crashing', async () => {
    const app = createServer(buildContainer())
    const res = await request(app).get('/api/accounts')
    expect([401, 403]).toContain(res.status)
  })
})
