import { describe, it, expect } from 'vitest'
import { generateSync } from 'otplib'
import { OtplibTotpProvider } from './OtplibTotpProvider.js'

describe('OtplibTotpProvider', () => {
  const provider = new OtplibTotpProvider()

  it('generates a non-empty Base32 secret', () => {
    const secret = provider.generateSecret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    expect(secret.length).toBeGreaterThan(10)
  })

  it('builds an otpauth URI with issuer and label', () => {
    const uri = provider.keyUri('JBSWY3DPEHPK3PXP', 'user@example.com')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain('issuer=ReconBanker')
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
  })

  it('verifies a freshly generated code', async () => {
    const secret = provider.generateSecret()
    const code = generateSync({ secret })
    expect(await provider.verify(secret, code)).toBe(true)
  })

  it('rejects an obviously wrong code', async () => {
    const secret = provider.generateSecret()
    expect(await provider.verify(secret, '000000')).toBe(false)
  })

  it('rejects malformed (non 6-digit) input without calling the verifier', async () => {
    const secret = provider.generateSecret()
    expect(await provider.verify(secret, 'abcdef')).toBe(false)
    expect(await provider.verify(secret, '12345')).toBe(false)
  })

  it('trims surrounding whitespace before verifying', async () => {
    const secret = provider.generateSecret()
    const code = generateSync({ secret })
    expect(await provider.verify(secret, `  ${code} `)).toBe(true)
  })

  it('rejects a code from a stale time window (beyond drift tolerance)', async () => {
    const secret = provider.generateSecret()
    const nowSec = Math.floor(Date.now() / 1000)
    const staleCode = generateSync({ secret, epoch: nowSec - 120 }) // 4 steps back
    expect(await provider.verify(secret, staleCode)).toBe(false)
  })

  it('uses a custom issuer in the otpauth URI when configured', () => {
    const custom = new OtplibTotpProvider('Acme Bank')
    const uri = custom.keyUri('JBSWY3DPEHPK3PXP', 'user@example.com')
    expect(uri).toContain('issuer=Acme%20Bank')
  })
})
