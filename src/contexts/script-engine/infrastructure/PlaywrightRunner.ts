import { BankScript } from '../domain/BankScript.js'
import { db } from '../../../shared/infrastructure/db/client.js'
import { credentialsCipher } from '../../../shared/infrastructure/crypto/CredentialsCipher.js'
import { CHROMIUM_ARGS, USER_AGENT, VIEWPORT, isHeadless, applyAntiWebdriver } from './playwrightLaunch.js'
import { makeDebugLogSink } from './debugLogSink.js'
import { withTimeout } from '../../../shared/util/withTimeout.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

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
}

export class PlaywrightRunner {
  constructor(private readonly logger?: ILogger) {}

  async execute(script: BankScript, context: RunContext): Promise<ScrapedTransaction[]> {
    if (!script.codeSnapshot) throw new Error(`Script ${script.id} has no code snapshot`)

    const { rows: [creds] } = await db.query(
      `SELECT username, encrypted_password FROM bank_credentials
       WHERE account_id = $1 AND status = 'valid'`,
      [context.accountId]
    )
    if (!creds) throw new Error(`No valid credentials for account ${context.accountId}`)

    const { chromium } = await import('playwright')
    const launch = chromium.launch({ headless: isHeadless(), args: CHROMIUM_ARGS })
    const browser = await withTimeout(launch, LAUNCH_TIMEOUT_MS, 'browser launch').catch((err) => {
      launch.then((b) => b.close()).catch(() => {})
      throw err
    })

    try {
      return await withTimeout(this.runOnBrowser(browser, script, context, creds), SCRIPT_TIMEOUT_MS, 'script execution')
    } finally {
      await withTimeout(browser.close(), CLOSE_TIMEOUT_MS, 'browser close').catch((err) => {
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
        ? makeDebugLogSink(this.logger.child('[bank-scrape-script]'), { accountId: context.accountId })
        : undefined,
    }

    const wrappedCode = `
      return (async function(page, context) {
        ${script.codeSnapshot}
      })(page, context)
    `
    const fn = new Function('page', 'context', wrappedCode)
    const transactions: ScrapedTransaction[] = await fn(page, scriptContext)
    return transactions ?? []
  }
}
