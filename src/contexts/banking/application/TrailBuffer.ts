import { MAX_LOG_LINE_CHARS, type IFailureTrail, type TrailEntry } from '../../../shared/domain/failureTrail.js'

// A pinned head plus a rolling tail, not one flat window.
//
// A persistent monitor emits roughly two events per minute in steady state and can
// run for days, so a flat window of any practical size ends up holding nothing but
// the most recent poll cycles — it evicts the unique login phase in order to keep
// more near-identical copies of the repetitive one. And an authentication failure at
// hour six is usually explained by what happened at hour zero.
//
// 50 pinned covers launch through authentication on both contracts (the assisted
// auth wait is the longest, and it reports on entry and exit only, not per poll).
// The persistent contract reaches this buffer once #157 hands the monitor a recorder;
// the window is sized for it now because it is the demanding case.
const PINNED = 50
const ROLLING = 150

// Per-entry budget, derived from the one line-size limit rather than restated, so the
// two cannot drift. Halved to leave room for the wrapper fields on the flush line.
const MAX_ENTRY_CHARS = Math.floor(MAX_LOG_LINE_CHARS / (2 * (PINNED + ROLLING)))
const MAX_STRING_CHARS = 120

/**
 * The in-memory event trail for one run. Filled by the debug-log sink on every line a
 * script emits, drained by ScrapeRunRecorder — flushed to the log on failure,
 * discarded on success.
 *
 * In-process only, so a hard crash loses the trail; boot reconciliation can then
 * report only that the run was orphaned. That is inherent to flushing on failure, and
 * the alternative — writing every checkpoint to disk as it happens — is the volume
 * problem this buffer exists to avoid.
 */
export class TrailBuffer implements IFailureTrail {
  private readonly head: TrailEntry[] = []
  private readonly tail: TrailEntry[] = []
  private dropped = 0

  event(entry: TrailEntry): void {
    const clamped = clampEntry(entry)
    if (this.head.length < PINNED) {
      this.head.push(clamped)
      return
    }
    this.tail.push(clamped)
    // shift() on a 150-element array, at ~2 events per minute, is not worth a ring index.
    if (this.tail.length > ROLLING) {
      this.tail.shift()
      this.dropped += 1
    }
  }

  /**
   * The pinned head, then a marker for whatever the window evicted, then the tail.
   * The marker matters: without it the trail looks continuous, and a reader would
   * wrongly conclude that authentication was immediately followed by the failure.
   */
  drain(): TrailEntry[] {
    const drained = [
      ...this.head,
      ...(this.dropped > 0 ? [{ event: 'trail_truncated', dropped: this.dropped }] : []),
      ...this.tail,
    ]
    this.head.length = 0
    this.tail.length = 0
    this.dropped = 0
    return drained
  }
}

// Clamps one entry so no single event can blow the flushed line's budget — a script
// is free to log a whole page's text as an error message. Truncates the long values
// first and keeps the field names, since which fields were present is itself a clue.
function clampEntry(entry: TrailEntry): TrailEntry {
  if (serializedSize(entry) <= MAX_ENTRY_CHARS) return entry

  const trimmed: TrailEntry = {}
  for (const [key, value] of Object.entries(entry)) trimmed[key] = truncate(value)
  trimmed.trail_entry_truncated = true
  if (serializedSize(trimmed) <= MAX_ENTRY_CHARS) return trimmed

  // Still oversized: the entry has too many fields, not just long ones. Keep the
  // identity — when it happened and what it was — and drop the payload.
  return { at: identity(entry.at), event: identity(entry.event), trail_entry_truncated: true }
}

const truncate = (value: unknown): unknown =>
  typeof value === 'string' && value.length > MAX_STRING_CHARS
    ? `${value.slice(0, MAX_STRING_CHARS)}…`
    : value

// The last resort has to be bounded unconditionally, so it cannot pass a value of
// unknown size through. `at` and `event` come straight from a script's JSON and are only
// conventionally strings — the sink does not check `at` at all — so an object or array
// here would defeat the whole clamp.
const identity = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? '[dropped: not a scalar]' : truncate(value)

// Entries come from JSON.parse so they are always serializable, but the trail must
// never be the thing that breaks a run: treat an unserializable entry as oversized.
function serializedSize(entry: TrailEntry): number {
  try {
    return JSON.stringify(entry)?.length ?? MAX_ENTRY_CHARS + 1
  } catch {
    return MAX_ENTRY_CHARS + 1
  }
}
