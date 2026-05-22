// Markers that identify a FATAL scrape/session failure — one that must NOT be
// auto-retried because retrying risks locking the bank account (e.g. repeated bad
// logins). Scripts surface these by message: the Pichincha hook throws
// "login_failed: ...", and the runner/startFn throw "No valid credentials...".
// Anything not matched here is treated as transient and keeps retrying.
const FATAL_PATTERNS: RegExp[] = [
  /^\s*login_failed/i,
  /no valid credentials/i,
]

export function isFatalScrapeError(message: string): boolean {
  return FATAL_PATTERNS.some((re) => re.test(message))
}
