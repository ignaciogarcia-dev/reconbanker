/**
 * Detects a Postgres unique-violation (SQLSTATE 23505), optionally scoped to a
 * specific constraint/index name. Used to treat a lost insert race as a clean
 * no-op rather than a crash. For a partial unique index, pg reports the index
 * name in `constraint`.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { code?: unknown; constraint?: unknown }
  if (e.code !== '23505') return false
  return constraint === undefined || e.constraint === constraint
}
