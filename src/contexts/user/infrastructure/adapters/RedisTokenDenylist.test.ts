import { describe, it, expect, vi } from 'vitest'
import type { Redis } from 'ioredis'
import { RedisTokenDenylist } from './RedisTokenDenylist.js'

function fakeRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    exists: vi.fn(),
  } as unknown as Redis & { set: ReturnType<typeof vi.fn>; exists: ReturnType<typeof vi.fn> }
}

describe('RedisTokenDenylist', () => {
  it('stores the jti with a TTL until expiry', async () => {
    const redis = fakeRedis()
    const denylist = new RedisTokenDenylist(redis)
    const exp = Math.floor(Date.now() / 1000) + 3600

    await denylist.revoke('jti-1', exp)

    expect(redis.set).toHaveBeenCalledTimes(1)
    const [key, value, mode, ttl] = redis.set.mock.calls[0]
    expect(key).toBe('revoked_jti:jti-1')
    expect(value).toBe('1')
    expect(mode).toBe('EX')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(3600)
  })

  it('does not store anything for an already-expired token', async () => {
    const redis = fakeRedis()
    const denylist = new RedisTokenDenylist(redis)

    await denylist.revoke('jti-1', Math.floor(Date.now() / 1000) - 10)

    expect(redis.set).not.toHaveBeenCalled()
  })

  it('reports revocation status from redis EXISTS', async () => {
    const redis = fakeRedis()
    const denylist = new RedisTokenDenylist(redis)

    redis.exists.mockResolvedValueOnce(1)
    expect(await denylist.isRevoked('jti-1')).toBe(true)

    redis.exists.mockResolvedValueOnce(0)
    expect(await denylist.isRevoked('jti-2')).toBe(false)
  })
})
