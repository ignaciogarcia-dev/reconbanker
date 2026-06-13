import { BankScript } from '../domain/BankScript.js'
import { db } from '../../../shared/infrastructure/db/client.js'
import { credentialsCipher } from '../../../shared/infrastructure/crypto/CredentialsCipher.js'
import { CHROMIUM_ARGS, USER_AGENT, VIEWPORT, isHeadless, applyAntiWebdriver } from './playwrightLaunch.js'
import { makeDebugLogSink } from './debugLogSink.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

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
    const browser = await chromium.launch({
      headless: isHeadless(),
      args: CHROMIUM_ARGS,
    })

    const TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    // Everything after launch is wrapped so the browser is always closed — even
    // if newContext/newPage/applyAntiWebdriver throws — and the timeout timer is
    // always cleared (a finished scrape must not leave a 10-min timer running).
    try {
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

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Script execution timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
      })

      const wrappedCode = `
        return (async function(page, context) {
          ${script.codeSnapshot}
        })(page, context)
      `
      const fn = new Function('page', 'context', wrappedCode)
      const transactions: ScrapedTransaction[] = await Promise.race([fn(page, scriptContext), timeout])
      return transactions ?? []
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      await browser.close()
    }
  }
}
