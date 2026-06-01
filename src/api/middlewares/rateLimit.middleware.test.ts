import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildRateLimiter } from './rateLimit.middleware.js'

describe('buildRateLimiter', () => {
  it('returns 429 with the rate-limited error body once the limit is exceeded', async () => {
    const app = express()
    app.use(buildRateLimiter({ windowMs: 60_000, limit: 2 }))
    app.get('/ping', (_req, res) => res.json({ ok: true }))

    const agent = request(app)
    expect((await agent.get('/ping')).status).toBe(200)
    expect((await agent.get('/ping')).status).toBe(200)

    const blocked = await agent.get('/ping')
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
    })
  })
})
