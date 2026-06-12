// Only `access` is accepted by the auth middleware while `2fa_pending` and `ws` are short-lived single-purpose tokens
export type TokenScope = 'access' | '2fa_pending' | 'ws'

export interface TokenPayload {
  sub: string
  email: string
  // Legacy tokens lack scope and default to 'access'
  scope?: TokenScope
  // JWT id used for revocation
  jti?: string
  // Expiry as epoch seconds populated by verify()
  exp?: number
}

export interface IssueOptions {
  // Overrides the issuer's default lifetime such as '5m' for a 2FA challenge
  expiresIn?: string
}

export interface ITokenIssuer {
  issue(payload: TokenPayload, opts?: IssueOptions): string
  verify(token: string): TokenPayload | null
}
