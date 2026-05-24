import pg from 'pg'

let pool: pg.Pool | null = null

export function getTestPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    })
  }
  return pool
}

const ALL_DOMAIN_TABLES = [
  'conciliated_transactions',
  'conciliation_attempts',
  'conciliation_requests',
  'bank_transactions',
  'bank_scrape_steps',
  'bank_scrape_runs',
  'bank_credentials',
  'account_config',
  'accounts',
  'users',
] as const

export const CANONICAL_SCRIPT_ID = 'b2010000-0000-0000-0000-000000000001'
export const CANONICAL_BANK_ID = 'a1000000-0000-0000-0000-000000000001'

/**
 * Resets the DB to a known-clean state with the canonical seeds restored:
 * - All per-user/account/transaction tables are truncated.
 * - `banks` keeps only the canonical mi-dinero row.
 * - `bank_scripts` keeps only the canonical active mi-dinero/extract_transactions
 *   row (re-activated and back-dated to 2020 so tests that delete by `created_at`
 *   don't touch it).
 *
 * Call this in `beforeEach` of every integration test file so each test starts
 * from the same fixture, regardless of what the previous test did.
 */
export async function truncateAll(): Promise<void> {
  const p = getTestPool()
  await p.query(`TRUNCATE ${ALL_DOMAIN_TABLES.join(', ')} RESTART IDENTITY CASCADE`)
  // Break self-referential FKs (bank_scripts.base_script_id) so the DELETE below
  // can drop ancestor rows without violating the constraint.
  await p.query(`UPDATE bank_scripts SET base_script_id = NULL`)
  // Drop any test-created bank_scripts (keep only the canonical seed).
  await p.query(`DELETE FROM bank_scripts WHERE id <> $1`, [CANONICAL_SCRIPT_ID])
  // Drop any test-created banks (keep only the canonical seed).
  await p.query(`DELETE FROM banks WHERE id <> $1`, [CANONICAL_BANK_ID])
  // Restore canonical bank.
  await p.query(
    `INSERT INTO banks (id, code, name, status, created_at)
     VALUES ($1, 'mi-dinero', 'Mi Dinero', 'ready', '2020-01-01'::timestamptz)
     ON CONFLICT (id) DO UPDATE SET
       code   = 'mi-dinero',
       name   = 'Mi Dinero',
       status = 'ready'`,
    [CANONICAL_BANK_ID]
  )
  // Restore canonical script (idempotent re-activation).
  await p.query(
    `INSERT INTO bank_scripts (id, bank, bank_id, flow_type, version, status, origin, selector_map, code_snapshot, created_at)
     VALUES ($1, 'mi-dinero', $2, 'extract_transactions', '2.0.1', 'active', 'system', '{}'::jsonb, NULL, '2020-01-01'::timestamptz)
     ON CONFLICT (id) DO UPDATE SET
       status        = 'active',
       bank          = 'mi-dinero',
       flow_type     = 'extract_transactions',
       version       = '2.0.1',
       code_snapshot = NULL`,
    [CANONICAL_SCRIPT_ID, CANONICAL_BANK_ID]
  )
}

/**
 * Cleans up the shared pool after the suite. Vitest needs this so the process
 * can exit cleanly.
 */
export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
