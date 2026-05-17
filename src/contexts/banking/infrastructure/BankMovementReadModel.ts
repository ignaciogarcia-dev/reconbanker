import type pg from 'pg'
import { IBankMovementReadModel } from '../domain/ports/IBankMovementReadModel.js'
import {
  BankMovementListItemDto,
  ListBankMovementsFilter,
} from '../application/dto/BankMovementDto.js'

export class BankMovementReadModel implements IBankMovementReadModel {
  constructor(private readonly pool: pg.Pool) {}

  async list(filter: ListBankMovementsFilter): Promise<BankMovementListItemDto[]> {
    const { rows } = await this.pool.query(
      `SELECT id, external_id, amount, currency, sender_name, received_at, notified_at, excluded_at
         FROM bank_transactions
        WHERE account_id = $1
        ORDER BY received_at DESC
        LIMIT $2 OFFSET $3`,
      [filter.accountId, filter.limit, filter.offset]
    )
    return rows.map((r: any) => ({
      id: r.id,
      externalId: r.external_id,
      amount: Number(r.amount),
      currency: r.currency,
      senderName: r.sender_name ?? null,
      receivedAt: r.received_at,
      notifiedAt: r.notified_at ?? null,
      excludedAt: r.excluded_at ?? null,
    }))
  }
}
