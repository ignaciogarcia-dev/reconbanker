import { describe, it, expect, afterEach, vi } from 'vitest'
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

// The limiters the app actually mounts, rather than a copy of their options. Each is built
// once at import, so the environment has to be in place before the module is loaded — hence
// the resetModules/dynamic-import dance.
describe('the mounted limiters', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const loadWith = async (env: Record<string, string>) => {
    vi.resetModules()
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    return import('./rateLimit.middleware.js')
  }

  const ALL_LIMITS_ONE = {
    NODE_ENV: 'production',
    RATE_LIMIT_LOGIN_MAX: '1',
    RATE_LIMIT_TOTP_MAX: '1',
    RATE_LIMIT_REGISTER_MAX: '1',
    RATE_LIMIT_API_MAX: '1',
    RATE_LIMIT_ACTION_MAX: '1',
    RATE_LIMIT_OTP_MAX: '1',
    RATE_LIMIT_OTP_WINDOW_MS: '60000',
  }

  it('does nothing under tests, so suites are not rate limited into flakiness', async () => {
    const { loginRateLimiter } = await loadWith({ NODE_ENV: 'test', RATE_LIMIT_LOGIN_MAX: '1' })
    const app = express()
    app.use(loginRateLimiter)
    app.get('/login', (_req, res) => { res.json({ ok: true }) })

    const agent = request(app)
    for (let i = 0; i < 3; i++) expect((await agent.get('/login')).status).toBe(200)
  })

  it.each(['loginRateLimiter', 'totpRateLimiter', 'registerRateLimiter', 'apiRateLimiter'] as const)(
    'enforces the environment-configured limit for %s outside tests',
    async (name) => {
      const mod = await loadWith(ALL_LIMITS_ONE)
      const app = express()
      app.use(mod[name])
      app.get('/x', (_req, res) => { res.json({ ok: true }) })

      const agent = request(app)
      expect((await agent.get('/x')).status).toBe(200)
      expect((await agent.get('/x')).status).toBe(429)
    }
  )

  it('keys expensive actions by user id, so one account cannot spend another’s allowance', async () => {
    const { expensiveActionRateLimiter } = await loadWith(ALL_LIMITS_ONE)
    const app = express()
    app.use((req, _res, next) => {
      const user = req.headers['x-user']
      if (user) (req as { userId?: string }).userId = String(user)
      next()
    })
    app.use(expensiveActionRateLimiter)
    app.get('/run', (_req, res) => { res.json({ ok: true }) })

    const agent = request(app)
    expect((await agent.get('/run').set('x-user', 'alice')).status).toBe(200)
    expect((await agent.get('/run').set('x-user', 'bob')).status).toBe(200)
    expect((await agent.get('/run').set('x-user', 'alice')).status).toBe(429)
  })

  it('falls back to the client IP when the request carries no user id', async () => {
    // Mounted behind auth in the real app, but a fallback that keyed everyone together
    // would turn one unauthenticated caller into a denial of service for the rest.
    const { expensiveActionRateLimiter } = await loadWith(ALL_LIMITS_ONE)
    const app = express()
    app.use(expensiveActionRateLimiter)
    app.get('/run', (_req, res) => { res.json({ ok: true }) })

    const agent = request(app)
    expect((await agent.get('/run')).status).toBe(200)
    expect((await agent.get('/run')).status).toBe(429)
  })

  it('keys OTP submissions by account, so guesses cannot be spread across entry points', async () => {
    const { otpSubmitRateLimiter } = await loadWith(ALL_LIMITS_ONE)
    const app = express()
    app.get('/accounts/:accountId/otp', otpSubmitRateLimiter, (_req, res) => { res.json({ ok: true }) })
    app.get('/otp', otpSubmitRateLimiter, (_req, res) => { res.json({ ok: true }) })

    const agent = request(app)
    expect((await agent.get('/accounts/acc-1/otp')).status).toBe(200)
    // A different account is untouched by acc-1 having spent its attempt.
    expect((await agent.get('/accounts/acc-2/otp')).status).toBe(200)
    expect((await agent.get('/accounts/acc-1/otp')).status).toBe(429)
    // No accountId in the path at all: keyed by IP rather than lumped under one bucket.
    expect((await agent.get('/otp')).status).toBe(200)
  })
})
