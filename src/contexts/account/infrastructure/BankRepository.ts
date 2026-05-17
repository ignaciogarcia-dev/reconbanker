import { Bank } from '../domain/Bank.js'
import { IBankRepository } from '../domain/IBankRepository.js'
import { Executor } from './Executor.js'
import { BankRowMapper, BankRow } from './mappers/BankRowMapper.js'

export class BankRepository implements IBankRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): BankRepository {
    return new BankRepository(tx)
  }

  async findById(id: string): Promise<Bank | null> {
    const { rows } = await this.executor.query<BankRow>('SELECT * FROM banks WHERE id = $1', [id])
    return rows[0] ? BankRowMapper.toAggregate(rows[0]) : null
  }

  async findAll(): Promise<Bank[]> {
    const { rows } = await this.executor.query<BankRow>('SELECT * FROM banks ORDER BY name')
    return rows.map(BankRowMapper.toAggregate)
  }

  async save(bank: Bank): Promise<void> {
    await this.executor.query(
      `INSERT INTO banks (id, code, name, login_url, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name      = $3,
         login_url = $4,
         status    = $5`,
      [bank.id, bank.code, bank.name, bank.loginUrl ?? null, bank.status, bank.createdAt]
    )
  }
}
