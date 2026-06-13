import { generateSecret, generateURI, verify } from 'otplib'
import { ITotpProvider, TotpVerifyOptions, TotpVerifyResult } from '../../domain/ports/ITotpProvider.js'

const ISSUER = 'ReconBanker'

/**
 * otplib-backed TOTP provider. Uses the library's default pure-JS crypto plugin
 * so it works without native modules.
 *
 * Tolerance is past-only ([5, 0]) — a few seconds of backward clock drift but no
 * forward window — and `afterTimeStep` rejects already-consumed steps, so a code
 * cannot be replayed (RFC 6238 §5.2, banking posture).
 */
export class OtplibTotpProvider implements ITotpProvider {
  constructor(private readonly issuer: string = ISSUER) {}

  generateSecret(): string {
    return generateSecret()
  }

  keyUri(secret: string, accountLabel: string): string {
    return generateURI({ issuer: this.issuer, label: accountLabel, secret })
  }

  async verify(secret: string, token: string, opts?: TotpVerifyOptions): Promise<TotpVerifyResult> {
    const code = token.trim()
    if (!/^\d{6}$/.test(code)) return { valid: false }
    const result = await verify({
      secret,
      token: code,
      epochTolerance: [5, 0],
      ...(opts?.afterTimeStep != null ? { afterTimeStep: opts.afterTimeStep } : {}),
    })
    // otplib's VerifyResult unions TOTP (has timeStep) with HOTP (does not);
    // narrow structurally — at runtime this is always the TOTP variant.
    if (!result.valid) return { valid: false }
    return { valid: true, timeStep: 'timeStep' in result ? result.timeStep : undefined }
  }
}
