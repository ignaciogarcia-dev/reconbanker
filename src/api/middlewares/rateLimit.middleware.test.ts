import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { ipKeyGenerator } from 'express-rate-limit'
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

  // Mirrors the keyGenerator used by expensiveActionRateLimiter: each user gets
  // an independent bucket so one account cannot exhaust another's allowance.
  it('isolates buckets per user id when keyed by userId', async () => {
    const app = express()
    app.use((req, _res, next) => {
      ;(req as { userId?: string }).userId = String(req.headers['x-user'] ?? '')
      next()
    })
    app.use(
      buildRateLimiter({
        windowMs: 60_000,
        limit: 1,
        keyGenerator: (req) =>
          (req as { userId?: string }).userId || ipKeyGenerator(req.ip ?? '', 56),
      }),
    )
    app.get('/run', (_req, res) => res.json({ ok: true }))

    const agent = request(app)
    expect((await agent.get('/run').set('x-user', 'alice')).status).toBe(200)
    // Bob is unaffected by Alice having spent her allowance.
    expect((await agent.get('/run').set('x-user', 'bob')).status).toBe(200)
    // Alice's second request is blocked.
    expect((await agent.get('/run').set('x-user', 'alice')).status).toBe(429)
  })
})
