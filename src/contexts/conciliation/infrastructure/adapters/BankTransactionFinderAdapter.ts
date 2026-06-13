import type { IBankTransactionRepository } from '../../../banking/domain/IBankTransactionRepository.js'
import type { Tx } from '../../../../shared/persistence/index.js'
import { Executor } from '../../infrastructure/Executor.js'
import {
  IBankTransactionFinder,
  BankTransactionCandidate,
  BankTransactionView,
} from '../../domain/ports/IBankTransactionFinder.js'

export class BankTransactionFinderAdapter implements IBankTransactionFinder {
  constructor(
    private readonly executor: Executor,
    private readonly bankTxRepo: IBankTransactionRepository
  ) {}

  // All four methods share the same connection. Inside a unit of work the
  // caller passes the transaction so FOR UPDATE / markExcluded are serialized
  // against concurrent conciliation; outside one, the pool is fine.
  withTx(tx: Tx): IBankTransactionFinder {
    return new BankTransactionFinderAdapter(tx, this.bankTxRepo.withTx(tx))
  }

  async findCandidatesForAccount(accountId: string): Promise<BankTransactionCandidate[]> {
    const { rows } = await this.executor.query(
      `SELECT id, amount, currency, sender_name, received_at
         FROM bank_transactions
        WHERE account_id = $1 AND excluded_at IS NULL`,
      [accountId]
    )
    return rows.map((r: any) => ({
      id: r.id,
      amount: Number(r.amount),
      currency: r.currency,
      senderName: r.sender_name ?? undefined,
      receivedAt: r.received_at,
    }))
  }

  async findById(id: string, opts?: { forUpdate?: boolean }): Promise<BankTransactionView | null> {
    const tx = await this.bankTxRepo.findById(id, opts)
    if (!tx) return null
    return {
      id: tx.id,
      accountId: tx.accountId,
      amount: tx.amount,
      currency: tx.currency,
      senderName: tx.senderName,
      receivedAt: tx.receivedAt,
    }
  }

  isExcluded(id: string): Promise<boolean> {
    return this.bankTxRepo.isExcluded(id)
  }

  markExcluded(id: string): Promise<void> {
    return this.bankTxRepo.markExcluded(id)
  }
}
