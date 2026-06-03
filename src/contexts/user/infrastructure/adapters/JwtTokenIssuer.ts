import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { ITokenIssuer, IssueOptions, TokenPayload } from '../../domain/ports/ITokenIssuer.js'

export class JwtTokenIssuer implements ITokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string = process.env.JWT_EXPIRES_IN ?? '12h',
  ) {}

  issue(payload: TokenPayload, opts?: IssueOptions): string {
    const { sub, email } = payload
    const scope = payload.scope ?? 'access'
    return jwt.sign({ sub, email, scope }, this.secret, {
      expiresIn: (opts?.expiresIn ?? this.expiresIn) as jwt.SignOptions['expiresIn'],
      jwtid: payload.jti ?? randomUUID(),
    })
  }

  verify(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload
      if (!decoded?.sub) return null
      return {
        sub: decoded.sub,
        email: decoded.email,
        scope: decoded.scope ?? 'access',
        jti: decoded.jti,
        exp: decoded.exp,
      }
    } catch {
      return null
    }
  }
}
