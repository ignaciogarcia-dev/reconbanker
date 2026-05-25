import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { JwtTokenIssuer } from './JwtTokenIssuer.js'

const SECRET = 'test-secret'

describe('JwtTokenIssuer', () => {
  it('signs a token that round-trips with verify', () => {
    const issuer = new JwtTokenIssuer(SECRET)
    const token = issuer.issue({ sub: 'u-1', email: 'me@x.io' })

    expect(token).toBeTypeOf('string')
    expect(issuer.verify(token)).toEqual({ sub: 'u-1', email: 'me@x.io' })
  })

  it('honors a custom expiresIn', () => {
    const issuer = new JwtTokenIssuer(SECRET, '1d')
    const token = issuer.issue({ sub: 'u-1', email: 'me@x.io' })

    const decoded = jwt.decode(token) as { exp: number; iat: number }
    expect(decoded.exp - decoded.iat).toBe(60 * 60 * 24)
  })

  it('returns null for an invalid signature', () => {
    const issuer = new JwtTokenIssuer(SECRET)
    const other = new JwtTokenIssuer('different-secret')
    const token = other.issue({ sub: 'u-1', email: 'me@x.io' })

    expect(issuer.verify(token)).toBeNull()
  })

  it('returns null for a malformed token', () => {
    const issuer = new JwtTokenIssuer(SECRET)
    expect(issuer.verify('not-a-token')).toBeNull()
  })

  it('returns null when the payload is missing sub', () => {
    const issuer = new JwtTokenIssuer(SECRET)
    const token = jwt.sign({ email: 'me@x.io' }, SECRET)
    expect(issuer.verify(token)).toBeNull()
  })

  it('returns null for an expired token', () => {
    const issuer = new JwtTokenIssuer(SECRET, '1ms')
    const token = issuer.issue({ sub: 'u-1', email: 'me@x.io' })
    // Wait past expiry; jsonwebtoken treats 1ms as already expired immediately.
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(issuer.verify(token)).toBeNull()
        resolve(undefined)
      }, 10)
    })
  })
})
