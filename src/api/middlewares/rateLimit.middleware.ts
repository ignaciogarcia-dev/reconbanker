import rateLimit, { type Options } from 'express-rate-limit'

/**
 * Rate limiters are disabled under tests so the suite stays deterministic.
 * They are exercised directly in rateLimit.middleware.test.ts with skip off.
 */
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

/** Brute-force protection on login: a handful of attempts per IP per 15 min. */
export const loginRateLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5),
  skip: skipInTest,
})

/** Slows down account enumeration / mass registration. */
export const registerRateLimiter = buildRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_REGISTER_MAX ?? 3),
  skip: skipInTest,
})

/** Coarse global cap on the whole API surface. */
export const apiRateLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_API_MAX ?? 300),
  skip: skipInTest,
})
