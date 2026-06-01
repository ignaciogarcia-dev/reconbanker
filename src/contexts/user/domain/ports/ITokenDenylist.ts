export interface ITokenDenylist {
  /** Revoke a token by its jti until the given expiry (epoch seconds). */
  revoke(jti: string, expiresAtEpochSec: number): Promise<void>
  isRevoked(jti: string): Promise<boolean>
}
