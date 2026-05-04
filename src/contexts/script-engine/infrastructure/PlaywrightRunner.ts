import { BankScript } from '../domain/BankScript.js'
import { db } from '../../../shared/infrastructure/db/client.js'
import { appendFileSync, mkdirSync } from 'fs'
import path from 'path'

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
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })

    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'es-UY',
    })

    const page = await ctx.newPage()

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    const debugLogPath =
      process.env.SCRIPT_DEBUG_LOG_PATH ?? `/tmp/reconbanker-script-debug-${context.accountId}.log`
    mkdirSync(path.dirname(debugLogPath), { recursive: true })

    const scriptContext = {
      accountId: context.accountId,
      username: creds.username,
      password: creds.encrypted_password,
      lastExternalId: context.lastExternalId,
      debugLogPath,
      debugLog: (line: string) => appendFileSync(debugLogPath, `${line}\n`),
    }

    const TIMEOUT_MS = 6 * 60 * 1000 // 6 minutes

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Script execution timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
    )

    try {
      const wrappedCode = `
        return (async function(page, context) {
          ${script.codeSnapshot}
        })(page, context)
      `
      const fn = new Function('page', 'context', wrappedCode)
      const transactions: ScrapedTransaction[] = await Promise.race([fn(page, scriptContext), timeout])
      return transactions ?? []
    } finally {
      await browser.close()
    }
  }
}
