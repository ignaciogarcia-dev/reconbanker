// Blocks an account from automatic scrape/session triggers after a fatal failure
// (e.g. bad credentials). The block persists until an operator clears it via restart.
export interface IAccountScrapeBlocker {
  block(accountId: string, reason: string): Promise<void>
}
