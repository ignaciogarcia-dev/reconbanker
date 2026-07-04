import { TimeoutError } from '../../../shared/errors/index.js'

// Failure categories persisted in bank_scrape_runs.failure_type. Bank scripts encode
// the category as the prefix of their thrown message (e.g. "login_failed: ...").
export type FailureCategory =
  | 'timeout'
  | 'login_failed'
  | 'navigation_failed'
  | 'movements_fetch_failed'
  | 'detail_extraction_failed'
  | 'unknown'

const KNOWN_PREFIXES: ReadonlySet<FailureCategory> = new Set([
  'login_failed',
  'navigation_failed',
  'movements_fetch_failed',
  'detail_extraction_failed',
])

// Connection/auth failures are reported as a disconnection; everything else is a scrape failure.
const CONNECTION_CATEGORIES: ReadonlySet<FailureCategory> = new Set([
  'login_failed',
  'navigation_failed',
])

// Derives the failure category from a caught error. TimeoutError wins regardless of message;
// otherwise the prefix before the first ':' is matched against the known categories.
export function categorizeFailure(err: unknown): FailureCategory {
  if (err instanceof TimeoutError) return 'timeout'
  const message = err instanceof Error ? err.message : String(err)
  const prefix = message.split(':', 1)[0]?.trim() as FailureCategory | undefined
  if (prefix && KNOWN_PREFIXES.has(prefix)) return prefix
  return 'unknown'
}

// Routes a category to the internal event type that carries it to the dashboard and webhook notifier.
export function notifiableInternalType(category: FailureCategory): 'connection.failed' | 'scrape.failed' {
  return CONNECTION_CATEGORIES.has(category) ? 'connection.failed' : 'scrape.failed'
}
