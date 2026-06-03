/**
 * - `access`: a full session token accepted by the auth middleware.
 * - `2fa_pending`: a short-lived challenge token issued after the password step
 *   when a user has 2FA enabled. It only authorizes completing the TOTP step and
 *   is rejected by the auth middleware.
 */
export type TokenScope = 'access' | '2fa_pending'

export interface TokenPayload {
  sub: string
  email: string
  /** Token purpose; defaults to 'access' when absent (legacy tokens). */
  scope?: TokenScope
  /** JWT id — present on issued tokens; used for revocation. */
  jti?: string
  /** Expiry as epoch seconds — populated by verify(). */
  exp?: number
}

export interface IssueOptions {
  /** Overrides the issuer's default lifetime (e.g. '5m' for a 2FA challenge). */
  expiresIn?: string
}

export interface ITokenIssuer {
  issue(payload: TokenPayload, opts?: IssueOptions): string
  verify(token: string): TokenPayload | null
}
