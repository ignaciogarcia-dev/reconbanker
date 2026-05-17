import { BankTransaction } from '../../domain/BankTransaction.js'

export interface BankTransactionRow {
  id: string
  account_id: string
  external_id: string
  reference_hash: string
  amount: string | number
  currency: string
  sender_name: string | null
  received_at: Date
  script_id: string
  ingested_at: Date
  raw_payload: Record<string, unknown>
}

export const BankTransactionRowMapper = {
  toAggregate(row: BankTransactionRow): BankTransaction {
    return BankTransaction.reconstitute(row.id, {
      accountId: row.account_id,
      externalId: row.external_id,
      referenceHash: row.reference_hash,
      amount: Number(row.amount),
      currency: row.currency,
      senderName: row.sender_name ?? undefined,
      receivedAt: row.received_at,
      scriptId: row.script_id,
      ingestedAt: row.ingested_at,
      rawPayload: row.raw_payload,
    })
  },
}
