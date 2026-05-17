import { Bank, BankStatus } from '../../domain/Bank.js'

export interface BankRow {
  id: string
  code: string
  name: string
  login_url: string | null
  status: BankStatus
  created_at: Date
}

export const BankRowMapper = {
  toAggregate(row: BankRow): Bank {
    return Bank.reconstitute(row.id, {
      code: row.code,
      name: row.name,
      loginUrl: row.login_url ?? undefined,
      status: row.status,
      createdAt: row.created_at,
    })
  },
}
