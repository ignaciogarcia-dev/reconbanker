import { BankTransaction } from '../domain/BankTransaction.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { Executor } from './Executor.js'
import { BankTransactionRowMapper, BankTransactionRow } from './mappers/BankTransactionRowMapper.js'

export class BankTransactionRepository implements IBankTransactionRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): BankTransactionRepository {
    return new BankTransactionRepository(tx)
  }

  async findById(id: string, opts: { forUpdate?: boolean } = {}): Promise<BankTransaction | null> {
    const suffix = opts.forUpdate ? ' FOR UPDATE' : ''
    const { rows } = await this.executor.query<BankTransactionRow>(
      `SELECT * FROM bank_transactions WHERE id = $1${suffix}`,
      [id]
    )
    return rows[0] ? BankTransactionRowMapper.toAggregate(rows[0]) : null
  }

  async findByExternalId(accountId: string, externalId: string): Promise<BankTransaction | null> {
    const { rows } = await this.executor.query<BankTransactionRow>(
      'SELECT * FROM bank_transactions WHERE account_id=$1 AND external_id=$2',
      [accountId, externalId]
    )
    return rows[0] ? BankTransactionRowMapper.toAggregate(rows[0]) : null
  }

  async findLatestExternalId(accountId: string): Promise<string | null> {
    const { rows } = await this.executor.query<{ external_id: string }>(
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
    const { rows } = await this.executor.query<{ excluded_at: Date | null }>(
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
    const { rows } = await this.executor.query<{ notified_at: Date | null }>(
      `SELECT notified_at FROM bank_transactions WHERE id = $1`,
      [id]
    )
    return rows[0]?.notified_at != null
  }

  async claimNotification(id: string): Promise<boolean> {
    const result = await this.executor.query(
      `UPDATE bank_transactions SET notified_at = now()
        WHERE id = $1 AND notified_at IS NULL`,
      [id]
    )
    return (result.rowCount ?? 0) > 0
  }

  async releaseNotification(id: string): Promise<void> {
    await this.executor.query(
      `UPDATE bank_transactions SET notified_at = NULL WHERE id = $1`,
      [id]
    )
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
