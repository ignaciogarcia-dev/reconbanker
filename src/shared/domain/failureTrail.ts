/**
 * The pre-failure event trail.
 *
 * Most of what a bank script reports never reaches disk: the debug-log sink
 * classifies any event that does not match its warn-pattern as `debug`, and the
 * effective log level is `info`. So the entire happy path leading up to a failure —
 * exactly the part that explains how far the run got — is dropped.
 *
 * The fix is not to raise the log level (a persistent monitor emits ~2 events a
 * minute, forever, per account) but to keep a bounded in-memory buffer and write it
 * out only when a run actually fails.
 *
 * Lives in the shared kernel because the two ends are in different contexts:
 * `script-engine`'s sink fills the buffer, `banking`'s recorder drains it.
 */
export type TrailEntry = Record<string, unknown>

/**
 * The largest log line this system will produce or parse.
 *
 * Shared because both ends depend on it: the sink refuses to `JSON.parse` a line above
 * this size (a persistent monitor can accumulate large in-memory state, and a multi-MB
 * line is an OOM risk), and the trail sizes its own flush to stay underneath. Keeping
 * one constant means raising the cap cannot silently invalidate the other end's budget.
 */
export const MAX_LOG_LINE_CHARS = 1_000_000

/** The fill end, which is all the sink is given. */
export interface ITrailSink {
  /** Records one event. Must never throw and never do I/O — it runs on every log line. */
  event(entry: TrailEntry): void
}

/** The drain end, held by whoever decides a run has ended. */
export interface IFailureTrail extends ITrailSink {
  /** Returns the buffered events in order and empties the buffer. */
  drain(): TrailEntry[]
}
