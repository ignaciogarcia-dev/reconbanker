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
  done: Promise<MonitorStopReason>
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
      const done = runMonitor({
        hooks,
        page,
        context: input.context,
        onTransactions: input.onTransactions,
        shouldStop: () => stopped || input.shouldStop(),
        getBankDay: input.getBankDay,
        pollIntervalMs: input.pollIntervalMs,
        authTimeoutMs: input.loginMode === 'assisted' ? 300_000 : 30_000,
      }).finally(async () => {
        await browserContext.close().catch(() => {})
      })

      return { stop: () => { stopped = true }, done }
    } catch (err) {
      await browserContext.close().catch(() => {})
      throw err
    }
  }
}
