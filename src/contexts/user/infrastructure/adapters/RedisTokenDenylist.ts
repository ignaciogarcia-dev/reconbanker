import type { Redis } from 'ioredis'
import { ITokenDenylist } from '../../domain/ports/ITokenDenylist.js'

const PREFIX = 'revoked_jti:'

/**
 * Redis-backed JWT denylist. Revoked jtis are stored with a TTL matching the
 * token's own expiry, so entries self-expire and the set stays bounded.
 */
export class RedisTokenDenylist implements ITokenDenylist {
  constructor(private readonly redis: Redis) {}

  async revoke(jti: string, expiresAtEpochSec: number): Promise<void> {
    const ttl = Math.ceil(expiresAtEpochSec - Date.now() / 1000)
    if (ttl <= 0) return // already expired; nothing to keep
    await this.redis.set(`${PREFIX}${jti}`, '1', 'EX', ttl)
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(`${PREFIX}${jti}`)) === 1
  }
}
