import { describe, it, expect } from 'vitest'
import { isFatalScrapeError } from './isFatalScrapeError.js'

describe('isFatalScrapeError', () => {
  it('classifies login failures and missing credentials as fatal', () => {
    expect(isFatalScrapeError('login_failed: usuario o contraseña incorrectos')).toBe(true)
    expect(isFatalScrapeError('  login_failed: timeout esperando el token')).toBe(true)
    expect(isFatalScrapeError('No valid credentials for account abc')).toBe(true)
    expect(isFatalScrapeError('no valid credentials')).toBe(true)
  })

  it('treats transient and lifecycle errors as non-fatal', () => {
    expect(isFatalScrapeError('auth_timeout')).toBe(false)
    expect(isFatalScrapeError('logged_out')).toBe(false)
    expect(isFatalScrapeError('Script execution timed out after 600s')).toBe(false)
    expect(isFatalScrapeError('selector not found')).toBe(false)
    expect(isFatalScrapeError('network error')).toBe(false)
    expect(isFatalScrapeError('')).toBe(false)
  })
})
