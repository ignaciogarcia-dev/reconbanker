// Local transaction shape — identical fields to banking's ScrapedTransaction.
// (PlaywrightRunner already declares its own local copy; we follow that precedent
// to avoid script-engine depending on the banking context.)
export interface MonitorTransaction {
  externalId: string
  referenceHash: string
  amount: number
  currency: string
  senderName?: string
  receivedAt: Date
  raw: Record<string, unknown>
}

// The object a hook-based bank script returns.
export interface ScriptHooks {
  // Navigate + fill credentials + submit. Does NOT wait for the dashboard.
  login(page: any, context: MonitorScriptContext): Promise<void>
  // True once the authenticated area (dashboard) is reached. May throw a fatal
  // Error (e.g. wrong credentials) to abort without retry.
  isAuthenticated(page: any): Promise<boolean>
  // Open movements, read today's incoming, expand detail; return the visible
  // batch (NOT deduplicated — runMonitor handles dedup).
  poll(page: any, context: MonitorScriptContext): Promise<MonitorTransaction[]>
  // Optional bank-specific session keep-alive (dismiss modals, scroll, etc.).
  keepAlive?(page: any): Promise<void>
}

export interface MonitorScriptContext {
  accountId: string
  username: string
  password: string
  lastExternalId: string | null
  debugLog?(line: string): void
}

export interface RunMonitorOptions {
  hooks: ScriptHooks
  page: any
  context: MonitorScriptContext
  // Emits each batch of NEW (deduplicated) incoming transactions.
  onTransactions(batch: MonitorTransaction[]): Promise<void>
  // Returns true to stop the monitor cleanly.
  shouldStop?(): boolean | Promise<boolean>
  // Returns the current bank-local day key (e.g. "21052026"); a change clears
  // the dedup set. Defaults to a single static day if omitted.
  getBankDay?(): string
  pollIntervalMs?: number       // default 60_000
  maxRuntimeMs?: number         // 0/undefined = no limit
  authTimeoutMs?: number        // assisted: ~300_000; simple: ~30_000
  // Injectable sleep so tests run without real timers.
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

  // 1) Login + wait for authentication (assisted: long timeout for human 2FA).
  await hooks.login(page, context)
  const authDeadline = Date.now() + authTimeoutMs
  let authed = false
  while (Date.now() < authDeadline) {
    if (await hooks.isAuthenticated(page)) { authed = true; break }
    await sleep(1_500)
  }
  if (!authed) { log('auth_timeout'); return 'auth_timeout' }
  log('authenticated')

  // 2) Monitor loop.
  const seen = new Set<string>()
  if (context.lastExternalId) seen.add(String(context.lastExternalId))
  let currentDay = getBankDay()
  const runDeadline = maxRuntimeMs > 0 ? Date.now() + maxRuntimeMs : null

  while (true) {
    if (await Promise.resolve(shouldStop())) { log('stop_requested'); return 'stop_requested' }
    if (runDeadline && Date.now() >= runDeadline) { log('max_runtime'); return 'max_runtime' }

    // Day rollover clears the dedup set (poll only returns "today", so old ids never recur).
    const day = getBankDay()
    if (day !== currentDay) { seen.clear(); currentDay = day }

    // Lost the session?
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
