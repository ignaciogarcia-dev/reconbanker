process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret'
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379'
}
if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
  // Fixed 32-byte base64 key for deterministic test encryption.
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
}
