import type { ILogger } from '../../../shared/logger/ILogger.js'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS = new Set<Level>(['debug', 'info', 'warn', 'error'])

// Largest debugLog line we'll parse. A persistent monitor can accumulate large
// in-memory state; refuse to JSON.parse a multi-MB line (OOM risk) and surface it.
const MAX_LINE_SIZE = 1_000_000

// Winston/printf reserve these; `context` would override the child-logger context.
const RESERVED_KEYS = ['message', 'level', 'timestamp', 'context', 'at']

// Defensive masking in case a script ever logs a credential-bearing field
// (e.g. the full `raw` movement or the context). Scripts don't today, but the
// sink is the only choke point that sees everything. Matched as a substring so
// compound names (accessToken, apiKey, passwordHash, refreshToken) are caught.
// NOTE: this is a SHALLOW pass — a credential nested inside an object value is
// NOT masked. Acceptable while scripts only ever log flat primitives; revisit if
// a script starts logging `raw`/nested objects.
const REDACT_SUBSTRINGS = [
  'password', 'passphrase', 'secret', 'token', 'credential', 'cookie', 'apikey', 'api_key', 'authorization',
]
// Short stems matched EXACTLY — as substrings they collide with benign words
// (e.g. "pin" in "shipping", "auth" in "authenticated", "key" in "monkey").
const REDACT_EXACT = new Set(['pin', 'auth', 'key'])

const isSecretKey = (key: string): boolean => {
  const k = key.toLowerCase()
  return REDACT_EXACT.has(k) || REDACT_SUBSTRINGS.some((s) => k.includes(s))
}

// Explicit overrides win over the pattern below (e.g. navigation_failed is fatal,
// not a recoverable warn). Everything else is classified structurally so new
// banks/events get a sensible level without touching this file. auth_timeout is
// intentionally NOT here: the `_timeout` pattern classifies it as warn, matching
// how SessionManager treats the auth_timeout stop reason (an operational, often
// expected outcome — e.g. a human not completing assisted 2FA in time).
const OVERRIDES: Record<string, Level> = {
  navigation_failed: 'error',
  logged_out: 'warn',
  poll_failed: 'warn',
  authenticated: 'info',
  poll_summary: 'info',
  stop_requested: 'info',
  max_runtime: 'info',
}

const WARN_PATTERN =
  /(_failed|_error|_timeout|_mismatch|_missing|not_captured|not_visible|cap_reached|empty_or_invalid)/

function classify(event: string, explicit?: unknown): Level {
  if (typeof explicit === 'string' && LEVELS.has(explicit as Level)) return explicit as Level
  if (OVERRIDES[event]) return OVERRIDES[event]
  if (WARN_PATTERN.test(event)) return 'warn'
  return 'debug'
}

/**
 * Builds a `debugLog(line)` callback for a bank script's MonitorScriptContext.
 * Scripts emit one JSON object per event (`{ at, event, ...data }`); this parses
 * it, assigns a Winston level by event name, strips colliding/secret fields, and
 * forwards it to `logger` with `baseMeta` (e.g. accountId, bank) on every line.
 */
export function makeDebugLogSink(
  logger: ILogger,
  baseMeta: Record<string, unknown> = {}
): (line: string) => void {
  return (line: string) => {
    if (typeof line !== 'string') return

    if (line.length > MAX_LINE_SIZE) {
      logger.warn('oversized_log_entry', { ...baseMeta, size: line.length })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      logger.debug(line, baseMeta)
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      logger.debug(line, baseMeta)
      return
    }

    const { event, level, ...rest } = parsed as Record<string, unknown>
    const at = rest.at

    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) {
      if (RESERVED_KEYS.includes(k)) continue
      cleaned[k] = isSecretKey(k) ? '[REDACTED]' : v
    }

    const lvl = classify(typeof event === 'string' ? event : '', level)
    const name = typeof event === 'string' && event ? event : 'monitor_event'
    // `at` is the event-emit time from the script; Winston adds its own log-write
    // `timestamp` in transports.ts. Both are kept on purpose — they're distinct.
    // baseMeta (system-supplied accountId/bank) wins: a script must not be able to
    // spoof trace identity by emitting its own accountId/bank in the payload.
    logger[lvl](name, { ...cleaned, ...(at !== undefined ? { at } : {}), ...baseMeta })
  }
}
