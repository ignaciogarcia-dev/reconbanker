import { PoolClient } from 'pg'
import { db } from '../../../shared/infrastructure/db/client.js'
import { BankTransaction } from '../domain/BankTransaction.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'

function reconstitute(row: any): BankTransaction {
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
}

export class BankTransactionRepository implements IBankTransactionRepository {
  constructor(private readonly client?: PoolClient) {}

  private get executor() {
    return this.client ?? db
  }

  async findById(id: string, opts: { forUpdate?: boolean } = {}): Promise<BankTransaction | null> {
    const suffix = opts.forUpdate ? ' FOR UPDATE' : ''
    const { rows } = await this.executor.query(
      `SELECT * FROM bank_transactions WHERE id = $1${suffix}`,
      [id]
    )
    if (!rows[0]) return null
    return reconstitute(rows[0])
  }

  async findByExternalId(accountId: string, externalId: string): Promise<BankTransaction | null> {
    const { rows } = await this.executor.query(
      'SELECT * FROM bank_transactions WHERE account_id=$1 AND external_id=$2',
      [accountId, externalId]
    )
    if (!rows[0]) return null
    return reconstitute(rows[0])
  }

  async findLatestExternalId(accountId: string): Promise<string | null> {
    const { rows } = await this.executor.query(
      `SELECT external_id FROM bank_transactions WHERE account_id = $1 ORDER BY received_at DESC LIMIT 1`,
      [accountId]
    )
    return rows[0]?.external_id ?? null
  }

  async markExcluded(id: string): Promise<void> {
    await this.executor.query(
      `UPDATE bank_transactions SET excluded_at = now() WHERE id = $1 AND excluded_at IS NULL`,
      [id]
    )
  }

  async isExcluded(id: string): Promise<boolean> {
    const { rows } = await this.executor.query(
      `SELECT excluded_at FROM bank_transactions WHERE id = $1`,
      [id]
    )
    return rows[0]?.excluded_at != null
  }

  async markNotified(id: string): Promise<void> {
    await this.executor.query(
      `UPDATE bank_transactions SET notified_at = now() WHERE id = $1`,
      [id]
    )
  }

  async markAllNotified(accountId: string): Promise<void> {
    await this.executor.query(
      `UPDATE bank_transactions SET notified_at = now()
        WHERE account_id = $1 AND notified_at IS NULL`,
      [accountId]
    )
  }

  async isNotified(id: string): Promise<boolean> {
    const { rows } = await this.executor.query(
      `SELECT notified_at FROM bank_transactions WHERE id = $1`,
      [id]
    )
    return rows[0]?.notified_at != null
  }

  async save(tx: BankTransaction): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_transactions
         (id, account_id, external_id, reference_hash, amount, currency, sender_name, received_at, script_id, ingested_at, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10)
       ON CONFLICT (account_id, external_id) DO NOTHING`,
      [
        tx.id,
        tx.accountId,
        tx.externalId,
        tx.referenceHash,
        tx.amount,
        tx.currency,
        tx.senderName ?? null,
        tx.receivedAt,
        tx.scriptId,
        JSON.stringify(tx.rawPayload),
      ]
    )
  }
}
