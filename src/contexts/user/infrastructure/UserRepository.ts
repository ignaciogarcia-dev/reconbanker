import { User, OperationMode } from '../domain/User.js'
import { IUserRepository } from '../domain/IUserRepository.js'
import { Executor } from './Executor.js'
import { UserRowMapper, UserRow } from './mappers/UserRowMapper.js'
import { credentialsCipher } from '../../../shared/infrastructure/crypto/CredentialsCipher.js'

const SELECT_COLUMNS =
  `id, email, name, password_hash, operation_mode, status, created_at,
   totp_secret, totp_enabled, totp_confirmed_at`

export class UserRepository implements IUserRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): UserRepository {
    return new UserRepository(tx)
  }

  /** Decrypts the at-rest TOTP secret before the row reaches the domain mapper. */
  private toAggregate(row: UserRow): User {
    return UserRowMapper.toAggregate({
      ...row,
      totp_secret: credentialsCipher().decryptNullable(row.totp_secret ?? null),
    })
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.executor.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE id = $1`,
      [id]
    )
    return rows[0] ? this.toAggregate(rows[0]) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.executor.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE email = $1 AND status = 'active'`,
      [email.trim().toLowerCase()]
    )
    return rows[0] ? this.toAggregate(rows[0]) : null
  }

  async save(user: User): Promise<void> {
    const encryptedSecret = credentialsCipher().encryptNullable(user.totpSecret)
    await this.executor.query(
      `INSERT INTO users
         (id, email, password_hash, name, operation_mode, status, created_at,
          totp_secret, totp_enabled, totp_confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         email             = $2,
         password_hash     = $3,
         name              = $4,
         operation_mode    = $5,
         status            = $6,
         totp_secret       = $8,
         totp_enabled      = $9,
         totp_confirmed_at = $10`,
      [
        user.id, user.email, user.passwordHash, user.name,
        user.operationMode, user.status, user.createdAt,
        encryptedSecret, user.isTotpEnabled(), user.totpConfirmedAt,
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

  async getRole(userId: string): Promise<string | null> {
    const { rows } = await this.executor.query<{ role: string | null }>(
      `SELECT role FROM users WHERE id = $1`,
      [userId]
    )
    return rows[0]?.role ?? null
  }
}
