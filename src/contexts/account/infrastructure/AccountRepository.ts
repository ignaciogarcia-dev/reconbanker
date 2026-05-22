import { Account } from '../domain/Account.js'
import { IAccountRepository } from '../domain/IAccountRepository.js'
import { Executor } from './Executor.js'
import { AccountRowMapper, AccountRow } from './mappers/AccountRowMapper.js'

export class AccountRepository implements IAccountRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): AccountRepository {
    return new AccountRepository(tx)
  }

  async findById(id: string): Promise<Account | null> {
    const { rows } = await this.executor.query<AccountRow>(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.id = $1`,
      [id]
    )
    return rows[0] ? AccountRowMapper.toAggregate(rows[0]) : null
  }

  async findByIdForUser(id: string, userId: string): Promise<Account | null> {
    const { rows } = await this.executor.query<AccountRow>(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.id = $1 AND a.user_id = $2`,
      [id, userId]
    )
    return rows[0] ? AccountRowMapper.toAggregate(rows[0]) : null
  }

  async findAllByUser(userId: string): Promise<Account[]> {
    const { rows } = await this.executor.query<AccountRow>(
      `SELECT a.*, b.code AS bank_code
         FROM accounts a
         JOIN banks b ON b.id = a.bank_id
        WHERE a.user_id = $1 AND a.status = 'active'`,
      [userId]
    )
    return rows.map(AccountRowMapper.toAggregate)
  }

  async save(account: Account): Promise<void> {
    await this.executor.query(
      `INSERT INTO accounts (id, user_id, bank_id, bank, name, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET name = $5, status = $6`,
      [account.id, account.userId, account.bankId, account.bank, account.name ?? null, account.status]
    )
  }

  async delete(id: string): Promise<void> {
    await this.executor.query(`DELETE FROM accounts WHERE id = $1`, [id])
  }

  async clearScrapeBlock(id: string): Promise<void> {
    await this.executor.query(
      `UPDATE accounts SET scrape_blocked_at = NULL, scrape_blocked_reason = NULL WHERE id = $1`,
      [id]
    )
  }
}
