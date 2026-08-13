/**
 * How a persistent monitor's exit becomes a run outcome.
 *
 * The run status stays three-valued (running / success / failed) so it remains a clean
 * answer to "did this work". The nuance goes in `stop_reason`, mirroring how
 * `bank_sessions.stop_reason` already works — and `bank_sessions` keeps sole ownership
 * of per-account attention state, so the two records can never disagree about whether
 * an account needs a human.
 */
export interface MonitorOutcome {
  status: 'success' | 'failed'
  /** Constrained to the vocabulary below, so the column stays queryable. */
  stopReason?: string
  /** Left undefined when the error itself should name the category. */
  failureType?: string
}

// A restart or a shutdown is not a broken script. Recording these as failures would
// mean every deploy showed up in the failure list.
const CLEAN_STOPS = new Set(['stop_requested', 'max_runtime'])

// Stop reasons that are genuine failures. Each doubles as its own failure category —
// deliberately, so a stage, a stop reason and a failure category describe one event in
// one vocabulary rather than three.
const FAILURE_STOPS = new Set([
  'auth_timeout',
  'logged_out',
  'watchdog_timeout',
  'browser_closed',
  'session_killed',
])

/**
 * `reason` is either a MonitorStopReason (the monitor returned) or a thrown error's
 * message (the session crashed). An unrecognised value is a crash: it is recorded as a
 * failure with no stop reason, leaving the category to be derived from the error, so an
 * arbitrary error message never lands in a column meant for a closed vocabulary.
 */
export function outcomeFromStopReason(reason: string): MonitorOutcome {
  if (CLEAN_STOPS.has(reason)) return { status: 'success', stopReason: reason }
  if (FAILURE_STOPS.has(reason)) return { status: 'failed', stopReason: reason, failureType: reason }
  return { status: 'failed' }
}
