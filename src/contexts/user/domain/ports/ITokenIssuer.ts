export interface TokenPayload {
  sub: string
  email: string
}

export interface ITokenIssuer {
  issue(payload: TokenPayload): string
  verify(token: string): TokenPayload | null
}
