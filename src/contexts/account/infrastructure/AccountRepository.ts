import { db } from '../../../shared/infrastructure/db/client.js'
import { Account } from '../domain/Account.js'
import { IAccountRepository } from '../domain/IAccountRepository.js'

function reconstitute(row: any): Account {
  return Account.reconstitute(row.id, {
    userId: row.user_id,
    bankId: row.bank_id,
    bank: row.bank_code,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
  })
}

export class AccountRepository implements IAccountRepository {
  async findById(id: string): Promise<Account | null> {
    const { rows } = await db.query(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.id = $1`,
      [id]
    )
    return rows[0] ? reconstitute(rows[0]) : null
  }

  async findByIdForUser(id: string, userId: string): Promise<Account | null> {
    const { rows } = await db.query(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.id = $1 AND a.user_id = $2`,
      [id, userId]
    )
    return rows[0] ? reconstitute(rows[0]) : null
  }

  async findAllByUser(userId: string): Promise<Account[]> {
    const { rows } = await db.query(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.user_id = $1 AND a.status = $2`,
      [userId, 'active']
    )
    return rows.map(reconstitute)
  }

  async save(account: Account): Promise<void> {
    await db.query(
      `INSERT INTO accounts (id, user_id, bank_id, bank, name, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET name = $5, status = $6`,
      [account.id, account.userId, account.bankId, account.bank, account.name, account.status]
    )
  }

  async delete(id: string): Promise<void> {
    await db.query(`DELETE FROM accounts WHERE id = $1`, [id])
  }
}
