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

  it('verifies a freshly generated code and reports its time step', async () => {
    const secret = provider.generateSecret()
    const code = generateSync({ secret })
    const result = await provider.verify(secret, code)
    expect(result.valid).toBe(true)
    expect(typeof result.timeStep).toBe('number')
  })

  it('rejects an obviously wrong code', async () => {
    const secret = provider.generateSecret()
    expect((await provider.verify(secret, '000000')).valid).toBe(false)
  })

  it('rejects malformed (non 6-digit) input without calling the verifier', async () => {
    const secret = provider.generateSecret()
    expect((await provider.verify(secret, 'abcdef')).valid).toBe(false)
    expect((await provider.verify(secret, '12345')).valid).toBe(false)
  })

  it('trims surrounding whitespace before verifying', async () => {
    const secret = provider.generateSecret()
    const code = generateSync({ secret })
    expect((await provider.verify(secret, `  ${code} `)).valid).toBe(true)
  })

  it('rejects a code from a stale time window (beyond drift tolerance)', async () => {
    const secret = provider.generateSecret()
    const nowSec = Math.floor(Date.now() / 1000)
    const staleCode = generateSync({ secret, epoch: nowSec - 120 }) // 4 steps back
    expect((await provider.verify(secret, staleCode)).valid).toBe(false)
  })

  it('rejects a future code (past-only tolerance, no forward window)', async () => {
    const secret = provider.generateSecret()
    const nowSec = Math.floor(Date.now() / 1000)
    const futureCode = generateSync({ secret, epoch: nowSec + 60 }) // 2 steps ahead
    expect((await provider.verify(secret, futureCode)).valid).toBe(false)
  })

  it('rejects replay of an already-used time step via afterTimeStep', async () => {
    const secret = provider.generateSecret()
    const code = generateSync({ secret })
    const first = await provider.verify(secret, code)
    expect(first.valid).toBe(true)
    const replay = await provider.verify(secret, code, { afterTimeStep: first.timeStep })
    expect(replay.valid).toBe(false)
  })

  it('uses a custom issuer in the otpauth URI when configured', () => {
    const custom = new OtplibTotpProvider('Acme Bank')
    const uri = custom.keyUri('JBSWY3DPEHPK3PXP', 'user@example.com')
    expect(uri).toContain('issuer=Acme%20Bank')
  })
})
