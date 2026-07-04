import { Account } from '../domain/Account.js'
import { IAccountRepository, AccountSummary } from '../domain/IAccountRepository.js'
import { Executor } from './Executor.js'
import { AccountRowMapper, AccountRow } from './mappers/AccountRowMapper.js'

interface AccountSummaryRow {
  id: string
  bank: string
  name: string | null
  status: string
  session_status: AccountSummary['sessionStatus']
  assisted_persistent: boolean | null
}

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

  async findSummariesByUser(userId: string): Promise<AccountSummary[]> {
    const { rows } = await this.executor.query<AccountSummaryRow>(
      `SELECT a.id, a.bank, a.name, a.status, bs.status AS session_status,
              (ac.session_type = 'persistent' AND ac.login_mode = 'assisted') AS assisted_persistent
         FROM accounts a
         LEFT JOIN bank_sessions bs ON bs.account_id = a.id
         LEFT JOIN account_config ac ON ac.account_id = a.id
        WHERE a.user_id = $1 AND a.status = 'active'`,
      [userId]
    )
    return rows.map((r) => ({
      id: r.id,
      bank: r.bank,
      name: r.name ?? null,
      status: r.status,
      sessionStatus: r.session_status ?? null,
      assistedPersistent: r.assisted_persistent === true,
    }))
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
}
