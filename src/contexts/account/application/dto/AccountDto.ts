export interface AccountSummaryDto {
  id: string
  bank: string
  name: string | null
  status: string
  // ISO timestamp + reason when a fatal failure has blocked the account from
  // automatic scrape/session triggers; null when not blocked.
  scrapeBlockedAt: string | null
  scrapeBlockedReason: string | null
}

export interface AccountDetailDto extends AccountSummaryDto {}
