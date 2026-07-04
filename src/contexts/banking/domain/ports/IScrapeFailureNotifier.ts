import { FailureCategory } from '../scrapeFailure.js'

// Records scrape outcomes for notification purposes. The dashboard reflects every failure live,
// but the external Slack/webhook alert is held back until a few consecutive failures, and a
// recovery notice is sent once the account comes back. Implementations swallow their own errors
// so a notifier/DB hiccup never breaks a scrape.
export interface IScrapeFailureNotifier {
  recordFailure(args: { userId: string; accountId: string; category: FailureCategory }): Promise<void>
  recordSuccess(args: { userId: string; accountId: string }): Promise<void>
}
