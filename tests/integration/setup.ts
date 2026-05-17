import 'dotenv/config'
import { execSync } from 'child_process'
import pg from 'pg'

process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error'

const baseUrl = process.env.DATABASE_URL_TEST
  ?? process.env.DATABASE_URL?.replace(/\/[^/]+(\?.*)?$/, '/reconbanker_test$1')
  ?? 'postgres://reconbanker:reconbanker@localhost:5432/reconbanker_test'

const adminUrl = baseUrl.replace(/\/[^/]+(\?.*)?$/, '/postgres$1')
const dbName = baseUrl.split('/').pop()!.split('?')[0]

// Make DATABASE_URL point to the test DB for any module that reads it later.
process.env.DATABASE_URL = baseUrl
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-test-secret'
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

async function ensureDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    const { rows } = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])
    if (rows.length === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`)
    }
  } finally {
    await client.end()
  }
}

async function runMigrations(): Promise<void> {
  execSync('pnpm migrate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: baseUrl },
  })
}

/**
 * Some script-engine tests delete rows added during the test with
 * `WHERE created_at > now() - interval '1 hour'`. In the test DB the seeded
 * scripts are inserted by migrations that just ran, so their created_at is
 * also recent — the cleanup would wipe them. Stamp the seeds in the past so
 * the heuristic distinguishes seeds from test-created rows.
 */
/**
 * Re-seeds the canonical mi-dinero bank + active script with stable fixed IDs.
 * Idempotent. Stamped in the past so tests that delete by `created_at > now() - 1h`
 * leave them untouched.
 */
async function ensureSeeds(): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO banks (id, code, name, status, created_at)
       VALUES ('a1000000-0000-0000-0000-000000000001', 'mi-dinero', 'Mi Dinero', 'ready', '2020-01-01'::timestamptz)
       ON CONFLICT (code) DO NOTHING`
    )
    await client.query(
      `INSERT INTO bank_scripts (id, bank, flow_type, version, status, origin, selector_map, bank_id, created_at)
       SELECT 'b2010000-0000-0000-0000-000000000001', 'mi-dinero', 'extract_transactions', '2.0.1',
              'active', 'system', '{}'::jsonb, b.id, '2020-01-01'::timestamptz
         FROM banks b WHERE b.code = 'mi-dinero'
       ON CONFLICT (id) DO NOTHING`
    )
    await client.query(`UPDATE banks SET created_at = '2020-01-01'::timestamptz WHERE created_at > '2020-01-02'::timestamptz`)
    await client.query(`UPDATE bank_scripts SET created_at = '2020-01-01'::timestamptz WHERE created_at > '2020-01-02'::timestamptz`)
  } finally {
    await client.end()
  }
}

// Global setup: create the test database (if missing) and run migrations once.
await ensureDatabase()
await runMigrations()
await ensureSeeds()
