import { Account, AccountStatus } from '../../domain/Account.js'

export interface AccountRow {
  id: string
  user_id: string
  bank_id: string
  bank_code: string
  name: string | null
  status: AccountStatus
  created_at: Date
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
    })
  },
}
