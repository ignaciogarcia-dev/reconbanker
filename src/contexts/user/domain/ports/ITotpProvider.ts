/**
 * Time-based one-time password operations, kept behind a port so the domain and
 * use cases stay free of the concrete TOTP library.
 */
export interface ITotpProvider {
  /** Generates a fresh Base32 secret for a new enrollment. */
  generateSecret(): string

  /** Builds an otpauth:// URI the frontend renders as a QR code. */
  keyUri(secret: string, accountLabel: string): string

  /** True when `token` is a valid current code for `secret` (small clock drift allowed). */
  verify(secret: string, token: string): Promise<boolean>
}
