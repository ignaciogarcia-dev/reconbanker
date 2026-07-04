import { describe, it, expect, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { CredentialsCipher, credentialsCipher, resetCredentialsCipher } from './CredentialsCipher.js'

const cipher = new CredentialsCipher(randomBytes(32))

describe('CredentialsCipher', () => {
  it('round-trips a secret', () => {
    const enc = cipher.encrypt('s3cr3t-bank-password')
    expect(enc).not.toContain('s3cr3t-bank-password')
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(cipher.decrypt(enc)).toBe('s3cr3t-bank-password')
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'))
  })

  it('passes legacy plaintext through decrypt unchanged', () => {
    expect(cipher.decrypt('plaintext-legacy')).toBe('plaintext-legacy')
    expect(cipher.isEncrypted('plaintext-legacy')).toBe(false)
  })

  it('handles nullable helpers', () => {
    expect(cipher.encryptNullable(null)).toBeNull()
    expect(cipher.decryptNullable(null)).toBeNull()
    const enc = cipher.encryptNullable('x')!
    expect(cipher.decryptNullable(enc)).toBe('x')
  })

  it('rejects a key that is not 32 bytes', () => {
    expect(() => new CredentialsCipher(randomBytes(16))).toThrow(/32 bytes/)
  })

  it('fails to decrypt when the auth tag does not match (tamper detection)', () => {
    const other = new CredentialsCipher(randomBytes(32))
    const enc = cipher.encrypt('secret')
    expect(() => other.decrypt(enc)).toThrow()
  })
})

describe('credentialsCipher singleton', () => {
  const prevKey = process.env.CREDENTIALS_ENCRYPTION_KEY

  afterEach(() => {
    resetCredentialsCipher()
    if (prevKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY
    else process.env.CREDENTIALS_ENCRYPTION_KEY = prevKey
  })

  it('throws when CREDENTIALS_ENCRYPTION_KEY is not set', () => {
    resetCredentialsCipher()
    delete process.env.CREDENTIALS_ENCRYPTION_KEY
    expect(() => credentialsCipher()).toThrow(/CREDENTIALS_ENCRYPTION_KEY is required/)
  })

  it('memoizes the cipher and rebuilds it only after resetCredentialsCipher', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    resetCredentialsCipher()

    const first = credentialsCipher()
    expect(credentialsCipher()).toBe(first) // second call returns the memoized instance

    resetCredentialsCipher()
    expect(credentialsCipher()).not.toBe(first) // reset forces a fresh build from the env key
  })
})
