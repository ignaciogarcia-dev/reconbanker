import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

// Wire format `rbk_<prefix>_<secret>` where the clear prefix looks the row up and only sha-256 of the secret is stored
const PREFIX_BYTES = 4
const SECRET_BYTES = 32
const KEY_RE = /^rbk_([0-9a-f]{8})_([0-9a-f]{64})$/

export interface GeneratedApiKey {
  prefix: string
  secret: string
  plaintext: string
  hash: string
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(PREFIX_BYTES).toString('hex')
  const secret = randomBytes(SECRET_BYTES).toString('hex')
  return {
    prefix,
    secret,
    plaintext: `rbk_${prefix}_${secret}`,
    hash: hashSecret(secret),
  }
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function parseApiKey(raw: string): { prefix: string; secret: string } | null {
  const m = KEY_RE.exec(raw.trim())
  if (!m) return null
  return { prefix: m[1], secret: m[2] }
}

// Constant-time comparison of a presented secret against a stored hash
export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
