import { BankScript } from '../domain/BankScript.js'
import { db } from '../../../shared/infrastructure/db/client.js'
import { credentialsCipher } from '../../../shared/infrastructure/crypto/CredentialsCipher.js'
import { CHROMIUM_ARGS, USER_AGENT, VIEWPORT, isHeadless, applyAntiWebdriver } from './playwrightLaunch.js'
import { makeDebugLogSink } from './debugLogSink.js'
import { withTimeout } from '../../../shared/util/withTimeout.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'
import type { IStageRecorder, ScrapeStage } from '../../../shared/domain/scrapeStage.js'

const LAUNCH_TIMEOUT_MS = Number(process.env.BANK_SCRAPE_LAUNCH_TIMEOUT_MS ?? 60_000)
const SCRIPT_TIMEOUT_MS = Number(process.env.BANK_SCRAPE_SCRIPT_TIMEOUT_MS ?? 10 * 60_000)
const CLOSE_TIMEOUT_MS = Number(process.env.BANK_SCRAPE_CLOSE_TIMEOUT_MS ?? 30_000)

interface ScrapedTransaction {
  externalId: string
  referenceHash: string
  amount: number
  currency: string
  senderName?: string
  receivedAt: Date
  raw: Record<string, unknown>
}

interface RunContext {
  accountId: string
  lastExternalId: string | null
  // Optional for the same reason `logger` is: the runner can execute a script without
  // correlation wired up. The scrape use case always supplies both.
  runId?: string
  recorder?: IStageRecorder
}

// Records the stage if a recorder was supplied, otherwise just runs it. Keeps the
// happy path identical whether or not diagnostics are wired in.
const withStage = <T>(
  recorder: IStageRecorder | undefined,
  step: ScrapeStage,
  fn: () => Promise<T>,
): Promise<T> => (recorder ? recorder.stage(step, fn) : fn())

export class PlaywrightRunner {
  constructor(private readonly logger?: ILogger) {}

  async execute(script: BankScript, context: RunContext): Promise<ScrapedTransaction[]> {
    if (!script.codeSnapshot) throw new Error(`Script ${script.id} has no code snapshot`)

    const rec = context.recorder

    const creds = await withStage(rec, 'credentials', async () => {
      const { rows: [row] } = await db.query(
        `SELECT username, encrypted_password FROM bank_credentials
         WHERE account_id = $1 AND status = 'valid'`,
        [context.accountId]
      )
      if (!row) throw new Error(`No valid credentials for account ${context.accountId}`)
      return row as { username: string; encrypted_password: string }
    })

    const browser = await withStage(rec, 'launch', async () => {
      const { chromium } = await import('playwright')
      const launch = chromium.launch({ headless: isHeadless(), args: CHROMIUM_ARGS })
      return withTimeout(launch, LAUNCH_TIMEOUT_MS, 'browser launch').catch((err) => {
        launch.then((b) => b.close()).catch(() => {})
        throw err
      })
    })

    try {
      return await withTimeout(this.runOnBrowser(browser, script, context, creds), SCRIPT_TIMEOUT_MS, 'script execution')
    } finally {
      // Close is recorded but never allowed to mask the run's own result — a failing
      // close is a warn, exactly as before.
      await withStage(rec, 'close', () =>
        withTimeout(browser.close(), CLOSE_TIMEOUT_MS, 'browser close')
      ).catch((err) => {
        this.logger?.warn('browser close timed out', { error: err instanceof Error ? err.message : String(err) })
      })
    }
  }

  private async runOnBrowser(
    browser: import('playwright').Browser,
    script: BankScript,
    context: RunContext,
    creds: { username: string; encrypted_password: string },
  ): Promise<ScrapedTransaction[]> {
    const ctx = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
      locale: 'es-UY',
    })

    const page = await ctx.newPage()

    await applyAntiWebdriver(page)

    const scriptContext = {
      accountId: context.accountId,
      username: creds.username,
      password: credentialsCipher().decrypt(creds.encrypted_password),
      lastExternalId: context.lastExternalId,
      debugLog: this.logger
        ? makeDebugLogSink(
            this.logger.child('[bank-scrape-script]'),
            {
              accountId: context.accountId,
              ...(context.runId ? { runId: context.runId } : {}),
            },
            // The recorder is the trail's owner: it buffers what the script reports and
            // writes it out only if the run fails.
            context.recorder,
          )
        : undefined,
    }

    // Compiling the script body is its own stage: a syntax error here is a broken
    // script, not a broken bank, and the two should not land under one category.
    const fn = await withStage(context.recorder, 'load_script', async () => {
      const wrappedCode = `
        return (async function(page, context) {
          ${script.codeSnapshot}
        })(page, context)
      `
      return new Function('page', 'context', wrappedCode)
    })

    try {
      const transactions: ScrapedTransaction[] = await fn(page, scriptContext)
      return transactions ?? []
    } catch (err) {
      // The one piece of page state worth keeping: where the browser was when it broke.
      // Reading it can itself throw on a closed page, so it must never mask the failure.
      try { context.recorder?.observeUrl(page.url()) } catch { /* page already gone */ }
      throw err
    }
  }
}
