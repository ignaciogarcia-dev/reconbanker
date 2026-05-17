process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret'
}
