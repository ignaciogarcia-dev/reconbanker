import jwt from 'jsonwebtoken'
import { ITokenIssuer, TokenPayload } from '../../domain/ports/ITokenIssuer.js'

export class JwtTokenIssuer implements ITokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string = '7d',
  ) {}

  issue(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn as jwt.SignOptions['expiresIn'] })
  }

  verify(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload
      if (!decoded?.sub) return null
      return { sub: decoded.sub, email: decoded.email }
    } catch {
      return null
    }
  }
}
