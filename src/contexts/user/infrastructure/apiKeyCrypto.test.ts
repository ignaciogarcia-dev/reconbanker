import { describe, expect, it } from 'vitest'
import { generateApiKey, parseApiKey, hashSecret, secretMatches } from './apiKeyCrypto.js'

describe('apiKeyCrypto', () => {
  it('generates a parseable rbk_<prefix>_<secret> key whose hash matches', () => {
    const key = generateApiKey()
    expect(key.plaintext).toMatch(/^rbk_[0-9a-f]{8}_[0-9a-f]{64}$/)
    expect(key.hash).toBe(hashSecret(key.secret))

    const parsed = parseApiKey(key.plaintext)
    expect(parsed).toEqual({ prefix: key.prefix, secret: key.secret })
    expect(secretMatches(key.secret, key.hash)).toBe(true)
  })

  it('rejects malformed keys', () => {
    expect(parseApiKey('nope')).toBeNull()
    expect(parseApiKey('rbk_short_abc')).toBeNull()
    expect(parseApiKey('')).toBeNull()
  })

  it('does not match a wrong secret', () => {
    const key = generateApiKey()
    expect(secretMatches('deadbeef', key.hash)).toBe(false)
  })

  it('generates unique prefixes and secrets across calls', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.prefix).not.toBe(b.prefix)
    expect(a.secret).not.toBe(b.secret)
  })
})
