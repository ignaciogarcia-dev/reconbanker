import type { Page } from 'playwright'

/** Chromium launch flags shared by one-shot and persistent runners. */
export const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-gpu',
]

export const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const VIEWPORT = { width: 1280, height: 800 }

/** True unless PLAYWRIGHT_HEADLESS is explicitly set to "false". */
export function isHeadless(): boolean {
  return process.env.PLAYWRIGHT_HEADLESS !== 'false'
}

/** Hides the `navigator.webdriver` flag so scripts look like a real browser. */
export async function applyAntiWebdriver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
}
