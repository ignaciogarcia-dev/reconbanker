import { User, OperationMode } from '../domain/User.js'
import { IUserRepository } from '../domain/IUserRepository.js'
import { Executor } from './Executor.js'
import { UserRowMapper, UserRow } from './mappers/UserRowMapper.js'

export class UserRepository implements IUserRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): UserRepository {
    return new UserRepository(tx)
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.executor.query<UserRow>(
      `SELECT id, email, name, password_hash, operation_mode, status, created_at
         FROM users WHERE id = $1`,
      [id]
    )
    return rows[0] ? UserRowMapper.toAggregate(rows[0]) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.executor.query<UserRow>(
      `SELECT id, email, name, password_hash, operation_mode, status, created_at
         FROM users WHERE email = $1 AND status = 'active'`,
      [email.trim().toLowerCase()]
    )
    return rows[0] ? UserRowMapper.toAggregate(rows[0]) : null
  }

  async save(user: User): Promise<void> {
    await this.executor.query(
      `INSERT INTO users (id, email, password_hash, name, operation_mode, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         email          = $2,
         password_hash  = $3,
         name           = $4,
         operation_mode = $5,
         status         = $6`,
      [
        user.id, user.email, user.passwordHash, user.name,
        user.operationMode, user.status, user.createdAt,
      ]
    )
  }

  async getOperationMode(userId: string): Promise<OperationMode | null> {
    const { rows } = await this.executor.query<{ operation_mode: OperationMode | null }>(
      `SELECT operation_mode FROM users WHERE id = $1`,
      [userId]
    )
    return rows[0]?.operation_mode ?? null
  }

  async setOperationMode(userId: string, mode: OperationMode): Promise<void> {
    await this.executor.query(`UPDATE users SET operation_mode = $2 WHERE id = $1`, [userId, mode])
  }
}
