export interface TokenPayload {
  sub: string
  email: string
  /** JWT id — present on issued tokens; used for revocation. */
  jti?: string
  /** Expiry as epoch seconds — populated by verify(). */
  exp?: number
}

export interface ITokenIssuer {
  issue(payload: TokenPayload): string
  verify(token: string): TokenPayload | null
}
