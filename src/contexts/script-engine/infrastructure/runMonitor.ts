// Local copy of banking's ScrapedTransaction so script-engine never depends on the banking context
export interface MonitorTransaction {
  externalId: string
  referenceHash: string
  amount: number
  currency: string
  senderName?: string
  receivedAt: Date
  raw: Record<string, unknown>
}

// The object a hook-based bank script returns
export interface ScriptHooks {
  // Submits credentials but does NOT wait for the dashboard
  login(page: any, context: MonitorScriptContext): Promise<void>
  // True once the dashboard is reached and may throw a fatal Error to abort without retry
  isAuthenticated(page: any): Promise<boolean>
  // Returns the visible batch without deduplication since runMonitor handles dedup
  poll(page: any, context: MonitorScriptContext): Promise<MonitorTransaction[]>
  // Optional bank-specific session keep-alive
  keepAlive?(page: any): Promise<void>
}

// `length` and `type` drive the UI's segmented input while `purpose` is free-form context
export interface OtpRequestDescriptor {
  length: number
  type: 'numeric' | 'alphanumeric'
  purpose?: string
}

export interface MonitorScriptContext {
  accountId: string
  username: string
  password: string
  lastExternalId: string | null
  debugLog?(line: string): void
  // Owns the wait and resend policy and only resolves once a code arrives so the script awaits it once or falls back to manual auth when absent
  requestOtp?(descriptor: OtpRequestDescriptor, onResend?: () => Promise<void>): Promise<string>
}

export interface RunMonitorOptions {
  hooks: ScriptHooks
  page: any
  context: MonitorScriptContext
  // Emits each batch of new deduplicated incoming transactions
  onTransactions(batch: MonitorTransaction[]): Promise<void>
  // Returns true to stop the monitor cleanly
  shouldStop?(): boolean | Promise<boolean>
  // Returns the bank-local day key whose change clears the dedup set
  getBankDay?(): string
  pollIntervalMs?: number       // default 60_000
  maxRuntimeMs?: number         // 0 or undefined means no limit
  authTimeoutMs?: number        // around 300_000 assisted and 30_000 simple
  // Injectable sleep so tests run without real timers
  sleep?(ms: number): Promise<void>
}

export type MonitorStopReason =
  | 'stop_requested'
  | 'max_runtime'
  | 'logged_out'
  | 'auth_timeout'

export async function runMonitor(opts: RunMonitorOptions): Promise<MonitorStopReason> {
  const {
    hooks, page, context, onTransactions,
    shouldStop = () => false,
    getBankDay = () => 'static',
    pollIntervalMs = 60_000,
    maxRuntimeMs = 0,
    authTimeoutMs = 300_000,
    sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  } = opts

  const log = (event: string, data?: Record<string, unknown>) =>
    context.debugLog?.(JSON.stringify({ at: new Date().toISOString(), event, ...data }))

  // Login then wait for authentication with a long timeout for assisted human 2FA
  await hooks.login(page, context)
  const authDeadline = Date.now() + authTimeoutMs
  let authed = false
  while (Date.now() < authDeadline) {
    if (await hooks.isAuthenticated(page)) { authed = true; break }
    await sleep(1_500)
  }
  if (!authed) { log('auth_timeout'); return 'auth_timeout' }
  log('authenticated')

  // Monitor loop
  const seen = new Set<string>()
  if (context.lastExternalId) seen.add(String(context.lastExternalId))
  let currentDay = getBankDay()
  const runDeadline = maxRuntimeMs > 0 ? Date.now() + maxRuntimeMs : null

  while (true) {
    if (await Promise.resolve(shouldStop())) { log('stop_requested'); return 'stop_requested' }
    if (runDeadline && Date.now() >= runDeadline) { log('max_runtime'); return 'max_runtime' }

    // Day rollover clears the dedup set since poll only returns today so old ids never recur
    const day = getBankDay()
    if (day !== currentDay) { seen.clear(); currentDay = day }

    // Detect a lost session
    if (!(await hooks.isAuthenticated(page))) { log('logged_out'); return 'logged_out' }

    let batch: MonitorTransaction[]
    try {
      batch = await hooks.poll(page, context)
    } catch (err) {
      log('poll_failed', { error: err instanceof Error ? err.message : String(err) })
      if (hooks.keepAlive) await hooks.keepAlive(page).catch(() => {})
      await sleep(pollIntervalMs)
      continue
    }

    const fresh = batch.filter((t) => !seen.has(String(t.externalId)))
    if (fresh.length) {
      for (const t of fresh) seen.add(String(t.externalId))
      await onTransactions(fresh)
    } else if (hooks.keepAlive) {
      await hooks.keepAlive(page).catch(() => {})
    }

    await sleep(pollIntervalMs)
  }
}
