import { withTimeout } from '../../../shared/util/withTimeout.js'
import { TimeoutError } from '../../../shared/errors/index.js'
import type { IStageRecorder } from '../../../shared/domain/scrapeStage.js'

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
  // Called once immediately after authentication succeeds (before the monitor loop). Used to
  // signal a session that came back from needs_attention has actually re-authenticated.
  onAuthenticated?(): void
  // Records this session's stages. Optional: the monitor behaves identically without it,
  // and supplying it is what makes the checkpoint baseline independent of the script author.
  recorder?: IStageRecorder
}

export type MonitorStopReason =
  | 'stop_requested'
  | 'max_runtime'
  | 'logged_out'
  | 'auth_timeout'
  | 'watchdog_timeout'

export async function runMonitor(opts: RunMonitorOptions): Promise<MonitorStopReason> {
  const {
    hooks, page, context, onTransactions,
    shouldStop = () => false,
    getBankDay = () => 'static',
    pollIntervalMs = 60_000,
    maxRuntimeMs = 0,
    authTimeoutMs = 300_000,
    sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
    onAuthenticated,
    recorder,
  } = opts

  const log = (event: string, data?: Record<string, unknown>) =>
    context.debugLog?.(JSON.stringify({ at: new Date().toISOString(), event, ...data }))

  // Reading the URL can throw on a closed page, and a page is `any` here, so this must
  // never be the thing that breaks a session it was only trying to describe.
  const observeUrl = () => {
    try {
      if (typeof page?.url === 'function') recorder?.observeUrl(page.url())
    } catch { /* page already gone */ }
  }
  // Records a stage only when a recorder was supplied, keeping the happy path identical.
  const note = async (step: 'poll' | 'keep_alive', status: 'success' | 'failed', outcome?: {
    failureType?: string; errorMessage?: string
  }) => {
    if (!recorder) return
    observeUrl()
    await recorder.note(step, status, outcome)
  }

  // Login then wait for authentication with a long timeout for assisted human 2FA
  if (recorder) await recorder.stage('login', () => hooks.login(page, context))
  else await hooks.login(page, context)

  // The wait is opened rather than wrapped: it ends by falling out of the loop on
  // timeout, which stage() would record as a success. Reported on entry and exit only —
  // an assisted login polls up to 200 times, and a checkpoint per iteration would flood
  // the trail with nothing.
  const authWait = recorder?.beginStage('auth_wait')
  const authDeadline = Date.now() + authTimeoutMs
  let authed = false
  try {
    while (Date.now() < authDeadline) {
      // Bound each check by the remaining auth budget so a hang *inside* isAuthenticated can't block
      // past the deadline. A fatal throw still propagates (rejects the monitor); the void-catch only
      // guards the losing race arm. A timeout here is just the auth budget running out -> auth_timeout.
      const check = hooks.isAuthenticated(page)
      void check.catch(() => {})
      let res: boolean
      try {
        res = await withTimeout(check, Math.max(0, authDeadline - Date.now()), 'auth check')
      } catch (err) {
        if (err instanceof TimeoutError) break
        throw err
      }
      if (res) { authed = true; break }
      await sleep(1_500)
    }
  } catch (err) {
    // A fatal isAuthenticated throw aborts the session; close the wait before it leaves,
    // or the row would stay `started` and read as a hang.
    observeUrl()
    await authWait?.finish('failed', { errorMessage: err instanceof Error ? err.message : String(err) })
    throw err
  }
  if (!authed) {
    log('auth_timeout')
    observeUrl()
    await authWait?.finish('failed', {
      failureType: 'auth_timeout',
      errorMessage: `not authenticated within ${authTimeoutMs}ms`,
    })
    return 'auth_timeout'
  }
  await authWait?.finish('success')
  log('authenticated')
  onAuthenticated?.()

  // Monitor loop
  const seen = new Set<string>()
  if (context.lastExternalId) seen.add(String(context.lastExternalId))
  let currentDay = getBankDay()
  const runDeadline = maxRuntimeMs > 0 ? Date.now() + maxRuntimeMs : null

  // Transitions only, and only the first of each. A steady-state poll writes no row —
  // an eight-hour session at a 60s interval would otherwise leave ~480 of them, nearly
  // all "nothing new", burying the rows worth searching for. A script that fails every
  // poll for hours would do the same, so a recovered failure is recorded once too; the
  // repetition is visible in the trail, which is bounded by design.
  let recordedFirstPollSuccess = false
  let recordedFirstPollFailure = false

  while (true) {
    if (await Promise.resolve(shouldStop())) { log('stop_requested'); return 'stop_requested' }
    if (runDeadline && Date.now() >= runDeadline) { log('max_runtime'); return 'max_runtime' }

    // Day rollover clears the dedup set since poll only returns today so old ids never recur
    const day = getBankDay()
    if (day !== currentDay) { seen.clear(); currentDay = day }

    // Detect a lost session (watchdog-bounded so a hung check can't wedge the loop)
    const authCall = hooks.isAuthenticated(page)
    void authCall.catch(() => {})
    let authRes: boolean
    try {
      authRes = await withTimeout(authCall, 2 * pollIntervalMs, 'auth check')
    } catch (err) {
      if (err instanceof TimeoutError) {
        log('watchdog_timeout')
        // Attributed to `poll`: the liveness check is part of the poll cycle, and the
        // stage vocabulary has no separate session-check stage.
        await note('poll', 'failed', { failureType: 'watchdog_timeout', errorMessage: err.message })
        return 'watchdog_timeout'
      }
      throw err
    }
    if (!authRes) {
      log('logged_out')
      await note('poll', 'failed', { failureType: 'logged_out', errorMessage: 'session was no longer authenticated' })
      return 'logged_out'
    }

    let batch: MonitorTransaction[]
    try {
      batch = await withTimeout(hooks.poll(page, context), 2 * pollIntervalMs, 'poll')
    } catch (err) {
      if (err instanceof TimeoutError) {
        log('watchdog_timeout')
        await note('poll', 'failed', { failureType: 'watchdog_timeout', errorMessage: err.message })
        return 'watchdog_timeout'
      }
      log('poll_failed', { error: err instanceof Error ? err.message : String(err) })
      if (!recordedFirstPollFailure) {
        recordedFirstPollFailure = true
        await note('poll', 'failed', { errorMessage: err instanceof Error ? err.message : String(err) })
      }
      if (hooks.keepAlive) {
        // The inner .catch makes a keepAlive *error* non-fatal (resolves undefined); only a *hang* trips the watchdog.
        try {
          await withTimeout(hooks.keepAlive(page).catch(() => {}), 2 * pollIntervalMs, 'keepAlive')
        } catch (kaErr) {
          if (kaErr instanceof TimeoutError) {
            log('watchdog_timeout')
            await note('keep_alive', 'failed', { failureType: 'watchdog_timeout', errorMessage: kaErr.message })
            return 'watchdog_timeout'
          }
        }
      }
      await sleep(pollIntervalMs)
      continue
    }

    // One row for the first poll that worked: it is the transition that says the session
    // reached steady state, which distinguishes "polling normally" from "never got there".
    if (!recordedFirstPollSuccess) {
      recordedFirstPollSuccess = true
      await note('poll', 'success')
    }

    const fresh = batch.filter((t) => !seen.has(String(t.externalId)))
    if (fresh.length) {
      for (const t of fresh) seen.add(String(t.externalId))
      await onTransactions(fresh)
    } else if (hooks.keepAlive) {
      try {
        await withTimeout(hooks.keepAlive(page).catch(() => {}), 2 * pollIntervalMs, 'keepAlive')
      } catch (kaErr) {
        if (kaErr instanceof TimeoutError) {
          log('watchdog_timeout')
          await note('keep_alive', 'failed', { failureType: 'watchdog_timeout', errorMessage: kaErr.message })
          return 'watchdog_timeout'
        }
      }
    }

    await sleep(pollIntervalMs)
  }
}
