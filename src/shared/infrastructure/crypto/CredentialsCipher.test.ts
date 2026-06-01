import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { CredentialsCipher } from './CredentialsCipher.js'

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
