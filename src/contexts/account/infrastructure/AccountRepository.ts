import { db } from '../../../shared/infrastructure/db/client.js'
import { Account } from '../domain/Account.js'
import { IAccountRepository } from '../domain/IAccountRepository.js'

export class AccountRepository implements IAccountRepository {
  async findById(id: string): Promise<Account | null> {
    const { rows } = await db.query(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.id = $1`,
      [id]
    )
    if (!rows[0]) return null
    return Account.reconstitute(rows[0].id, {
      bankId: rows[0].bank_id,
      bank: rows[0].bank_code,
      name: rows[0].name,
      status: rows[0].status,
      createdAt: rows[0].created_at,
    })
  }

  async findAll(): Promise<Account[]> {
    const { rows } = await db.query(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.status = $1`,
      ['active']
    )
    return rows.map(r => Account.reconstitute(r.id, {
      bankId: r.bank_id,
      bank: r.bank_code,
      name: r.name,
      status: r.status,
      createdAt: r.created_at,
    }))
  }

  async save(account: Account): Promise<void> {
    await db.query(
      `INSERT INTO accounts (id, bank_id, bank, name, status, created_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET name = $4, status = $5`,
      [account.id, account.bankId, account.bank, account.name, account.status]
    )
  }

  async delete(id: string): Promise<void> {
    await db.query(`DELETE FROM accounts WHERE id = $1`, [id])
  }
}
