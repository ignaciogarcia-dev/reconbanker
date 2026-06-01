import { describe, it, expect } from 'vitest'
import { validateEnv } from './validateEnv.js'

const KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' // 32 bytes base64

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgres://x',
    REDIS_URL: 'redis://x',
    JWT_SECRET: 'a-sufficiently-long-secret-value-1234',
    CREDENTIALS_ENCRYPTION_KEY: KEY,
    CORS_ORIGINS: 'https://app.example.com',
    NODE_ENV: 'production',
    ...overrides,
  } as NodeJS.ProcessEnv
}

describe('validateEnv', () => {
  it('passes for a valid production environment', () => {
    expect(() => validateEnv(baseEnv())).not.toThrow()
  })

  it('requires DATABASE_URL, REDIS_URL and the encryption key', () => {
    expect(() => validateEnv(baseEnv({ DATABASE_URL: undefined }))).toThrow(/DATABASE_URL/)
    expect(() => validateEnv(baseEnv({ REDIS_URL: undefined }))).toThrow(/REDIS_URL/)
    expect(() => validateEnv(baseEnv({ CREDENTIALS_ENCRYPTION_KEY: undefined }))).toThrow(
      /CREDENTIALS_ENCRYPTION_KEY/,
    )
  })

  it('rejects a weak or short JWT_SECRET in production', () => {
    expect(() => validateEnv(baseEnv({ JWT_SECRET: 'short' }))).toThrow(/JWT_SECRET/)
    expect(() =>
      validateEnv(baseEnv({ JWT_SECRET: 'change_this_to_a_long_random_secret' })),
    ).toThrow(/JWT_SECRET/)
  })

  it('rejects a non-32-byte encryption key', () => {
    expect(() => validateEnv(baseEnv({ CREDENTIALS_ENCRYPTION_KEY: 'dG9vc2hvcnQ=' }))).toThrow(
      /CREDENTIALS_ENCRYPTION_KEY/,
    )
  })

  it('requires CORS_ORIGINS only in production', () => {
    expect(() => validateEnv(baseEnv({ CORS_ORIGINS: undefined }))).toThrow(/CORS_ORIGINS/)
    expect(() =>
      validateEnv(baseEnv({ CORS_ORIGINS: undefined, NODE_ENV: 'development', JWT_SECRET: 'short' })),
    ).not.toThrow()
  })
})
