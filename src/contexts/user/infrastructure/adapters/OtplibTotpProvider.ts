import { generateSecret, generateURI, verify } from 'otplib'
import { ITotpProvider } from '../../domain/ports/ITotpProvider.js'

const ISSUER = 'ReconBanker'

/**
 * otplib-backed TOTP provider. Uses the library's default pure-JS crypto plugin
 * so it works without native modules. Verification allows ±30s of clock drift
 * (one time step) to tolerate small clock differences between server and phone.
 */
export class OtplibTotpProvider implements ITotpProvider {
  constructor(private readonly issuer: string = ISSUER) {}

  generateSecret(): string {
    return generateSecret()
  }

  keyUri(secret: string, accountLabel: string): string {
    return generateURI({ issuer: this.issuer, label: accountLabel, secret })
  }

  async verify(secret: string, token: string): Promise<boolean> {
    const code = token.trim()
    if (!/^\d{6}$/.test(code)) return false
    const result = await verify({ secret, token: code, epochTolerance: 30 })
    return result.valid
  }
}
