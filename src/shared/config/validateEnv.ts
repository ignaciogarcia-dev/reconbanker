/**
 * Fail-fast validation of required environment at startup. Catches the most
 * common production misconfigurations (missing/weak secrets, no CORS origins)
 * before the server starts accepting traffic.
 */
const WEAK_JWT_PLACEHOLDERS = new Set([
  'change_this_to_a_long_random_secret',
  'cambia_esto_por_un_secreto_largo',
  'test-secret',
])

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const errors: string[] = []
  const isProd = env.NODE_ENV === 'production'

  if (!env.DATABASE_URL) errors.push('DATABASE_URL is required')
  if (!env.REDIS_URL) errors.push('REDIS_URL is required')

  const jwt = env.JWT_SECRET
  if (!jwt) {
    errors.push('JWT_SECRET is required')
  } else if (isProd && (jwt.length < 32 || WEAK_JWT_PLACEHOLDERS.has(jwt))) {
    errors.push('JWT_SECRET must be a strong secret of at least 32 characters in production')
  }

  const key = env.CREDENTIALS_ENCRYPTION_KEY
  if (!key) {
    errors.push('CREDENTIALS_ENCRYPTION_KEY is required')
  } else if (Buffer.from(key, 'base64').length !== 32) {
    errors.push('CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  }

  if (isProd && !env.CORS_ORIGINS) {
    errors.push('CORS_ORIGINS is required in production (comma-separated allowed origins)')
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`)
  }
}
