import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit'

// Disabled under tests for determinism and exercised directly in rateLimit.middleware.test.ts
const skipInTest = (): boolean => process.env.NODE_ENV === 'test'

const RATE_LIMITED_BODY = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
}

export function buildRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: RATE_LIMITED_BODY,
    ...overrides,
  })
}

// Brute-force protection allowing a handful of login attempts per IP per 15 min
export const loginRateLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5),
  skip: skipInTest,
})

// Brute-force protection for the 2FA code endpoints (enrollment confirm and
// disable). Without it those routes would inherit only the coarse 300/15min
// global cap, far looser than login's 5 attempts.
export const totpRateLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_TOTP_MAX ?? 5),
  skip: skipInTest,
})

// Slows down account enumeration and mass registration
export const registerRateLimiter = buildRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_REGISTER_MAX ?? 3),
  skip: skipInTest,
})

// Coarse global cap on the whole API surface
export const apiRateLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_API_MAX ?? 300),
  skip: skipInTest,
})

// Keyed by user id so one account cannot flood the queues so mount behind auth so req.userId exists
export const expensiveActionRateLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_ACTION_MAX ?? 30),
  keyGenerator: (req) =>
    (req as { userId?: string }).userId ?? ipKeyGenerator(req.ip ?? '', 56),
  skip: skipInTest,
})

// Keyed by accountId so OTP guesses cannot burn the bank's limited real attempts from either entry point
export const otpSubmitRateLimiter = buildRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_OTP_WINDOW_MS ?? 10 * 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_OTP_MAX ?? 5),
  keyGenerator: (req) =>
    (req.params as { accountId?: string }).accountId ?? ipKeyGenerator(req.ip ?? '', 56),
  skip: skipInTest,
})
