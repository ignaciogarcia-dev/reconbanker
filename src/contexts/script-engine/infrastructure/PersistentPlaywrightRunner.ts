import path from 'path'
import { ScriptHooks, MonitorScriptContext, MonitorTransaction, runMonitor, MonitorStopReason } from './runMonitor.js'
import { CHROMIUM_ARGS, USER_AGENT, VIEWPORT, isHeadless, applyAntiWebdriver } from './playwrightLaunch.js'

export interface PersistentRunnerInput {
  scriptCode: string
  context: MonitorScriptContext
  loginMode: 'simple' | 'assisted'
  pollIntervalMs: number
  onTransactions(batch: MonitorTransaction[]): Promise<void>
  shouldStop(): boolean
  getBankDay?(): string
}

export interface PersistentSessionHandle {
  stop(): void
  // Force-terminates the browser so a hung monitor ends at once; `done` rejects with 'session_killed'.
  kill(): void
  done: Promise<MonitorStopReason>
  // Resolves true once the session authenticates (2FA entered), false if it ends first. Never rejects.
  authenticated: Promise<boolean>
}

const PROFILES_DIR = process.env.PLAYWRIGHT_PROFILES_DIR ?? path.resolve(process.cwd(), 'playwright-profiles')

/**
 * Loads a hook-based script, launches a persistent-profile headful browser, and
 * runs the monitor loop. Returns a handle whose `done` promise resolves with the
 * stop reason when the monitor exits (stop requested, logged out, crash, etc.).
 */
export class PersistentPlaywrightRunner {
  async start(input: PersistentRunnerInput): Promise<PersistentSessionHandle> {
    const { chromium } = await import('playwright')

    const userDataDir = path.join(PROFILES_DIR, input.context.accountId)
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: isHeadless(),
      viewport: VIEWPORT,
      locale: 'es-EC',
      userAgent: USER_AGENT,
      args: CHROMIUM_ARGS,
    })

    // Once the monitor starts its .finally closes the context. Until then any
    // failure (page setup, the script body throwing, or missing hooks) must
    // close it here, or the browser process + on-disk profile leak.
    try {
      const page = browserContext.pages()[0] ?? (await browserContext.newPage())
      await applyAntiWebdriver(page)

      // Execute the script body; a hook-based script returns the hooks object.
      const fn = new Function('page', 'context', `return (async function(page, context){\n${input.scriptCode}\n})(page, context)`)
      const result = await fn(page, input.context)
      if (!result || typeof result.poll !== 'function') {
        throw new Error('persistent script did not return a hooks object with a poll() function')
      }
      const hooks = result as ScriptHooks

      let stopped = false
      let markAuthed!: (ok: boolean) => void
      const authenticated = new Promise<boolean>((resolve) => { markAuthed = resolve })
      // A manual kill rejects `done` with a distinct reason so SessionManager can tell it from an
      // organic crash. A dedicated deferred (not the browser 'close' event) keeps it deterministic.
      let markKilled!: () => void
      const killed = new Promise<never>((_, reject) => { markKilled = () => reject(new Error('session_killed')) })
      killed.catch(() => {})
      const monitor = runMonitor({
        hooks,
        page,
        context: input.context,
        onTransactions: input.onTransactions,
        shouldStop: () => stopped || input.shouldStop(),
        getBankDay: input.getBankDay,
        pollIntervalMs: input.pollIntervalMs,
        authTimeoutMs: input.loginMode === 'assisted' ? 300_000 : 30_000,
        onAuthenticated: () => markAuthed(true),
      })
      // The monitor only notices a closed browser lazily (next poll, up to a minute later) and some
      // scripts never report it at all. Race an explicit close/disconnect so the session ends at once,
      // landing an assisted account in needs_attention instead of a stuck-green light.
      const closed = new Promise<never>((_, reject) => {
        browserContext.on('close', () => reject(new Error('browser_closed')))
        browserContext.browser()?.on('disconnected', () => reject(new Error('browser_closed')))
      })
      // Swallow the loser of the race so it never surfaces as an unhandled rejection
      monitor.catch(() => {})
      closed.catch(() => {})
      const done = Promise.race([monitor, closed, killed]).finally(async () => {
        await browserContext.close().catch(() => {})
      })
      // If the session ends before authenticating, settle authenticated=false so consumers
      // never wait forever; a prior markAuthed(true) wins since resolve is idempotent.
      void done.catch(() => {}).finally(() => markAuthed(false))

      return {
        stop: () => { stopped = true },
        kill: () => { markKilled(); void browserContext.close().catch(() => {}) },
        done,
        authenticated,
      }
    } catch (err) {
      await browserContext.close().catch(() => {})
      throw err
    }
  }
}
