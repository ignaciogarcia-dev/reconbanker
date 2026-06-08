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
      algorithm: 'HS256',
      expiresIn: (opts?.expiresIn ?? this.expiresIn) as jwt.SignOptions['expiresIn'],
      jwtid: payload.jti ?? randomUUID(),
    })
  }

  verify(token: string): TokenPayload | null {
    try {
      // Pin the algorithm so a token forged with a different alg (e.g. "none"
      // or an asymmetric-key confusion attempt) is rejected outright.
      const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as TokenPayload
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
