export interface TotpVerifyOptions {
  /**
   * Reject any time step <= this value (replay protection). Pass the time step
   * of the user's last successful verification so a code cannot be reused.
   */
  afterTimeStep?: number | null
}

export interface TotpVerifyResult {
  valid: boolean
  /** The matched time step when valid; persist it to block replay next time. */
  timeStep?: number
}

/**
 * Time-based one-time password operations, kept behind a port so the domain and
 * use cases stay free of the concrete TOTP library.
 */
export interface ITotpProvider {
  /** Generates a fresh Base32 secret for a new enrollment. */
  generateSecret(): string

  /** Builds an otpauth:// URI the frontend renders as a QR code. */
  keyUri(secret: string, accountLabel: string): string

  /**
   * Validates `token` against `secret` (small backward clock drift allowed, no
   * forward window). Returns the matched time step so callers can persist it and
   * reject replays via `afterTimeStep`.
   */
  verify(secret: string, token: string, opts?: TotpVerifyOptions): Promise<TotpVerifyResult>
}
