import { Account, AccountStatus } from '../../domain/Account.js'

export interface AccountRow {
  id: string
  user_id: string
  bank_id: string
  bank_code: string
  name: string | null
  status: AccountStatus
  created_at: Date
  scrape_blocked_at: Date | null
  scrape_blocked_reason: string | null
}

export const AccountRowMapper = {
  toAggregate(row: AccountRow): Account {
    return Account.reconstitute(row.id, {
      userId: row.user_id,
      bankId: row.bank_id,
      bank: row.bank_code,
      name: row.name ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      scrapeBlockedAt: row.scrape_blocked_at ?? null,
      scrapeBlockedReason: row.scrape_blocked_reason ?? null,
    })
  },
}
