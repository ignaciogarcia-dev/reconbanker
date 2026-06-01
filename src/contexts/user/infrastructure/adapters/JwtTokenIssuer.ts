import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { ITokenIssuer, TokenPayload } from '../../domain/ports/ITokenIssuer.js'

export class JwtTokenIssuer implements ITokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string = process.env.JWT_EXPIRES_IN ?? '12h',
  ) {}

  issue(payload: TokenPayload): string {
    const { sub, email } = payload
    return jwt.sign({ sub, email }, this.secret, {
      expiresIn: this.expiresIn as jwt.SignOptions['expiresIn'],
      jwtid: payload.jti ?? randomUUID(),
    })
  }

  verify(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload
      if (!decoded?.sub) return null
      return { sub: decoded.sub, email: decoded.email, jti: decoded.jti, exp: decoded.exp }
    } catch {
      return null
    }
  }
}
