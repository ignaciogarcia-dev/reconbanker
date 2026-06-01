import { BankCredentialsInput, BankCredentialsRecord, BankCredentialsStatus, validateBankCredentialsInput } from '../domain/BankCredentials.js'
import { IBankCredentialsRepository } from '../domain/IBankCredentialsRepository.js'
import { credentialsCipher } from '../../../shared/infrastructure/crypto/CredentialsCipher.js'
import { Executor } from './Executor.js'

interface BankCredentialsRow {
  account_id: string
  username: string
  status: BankCredentialsStatus
  last_validated_at: Date | null
}

export class BankCredentialsRepository implements IBankCredentialsRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): BankCredentialsRepository {
    return new BankCredentialsRepository(tx)
  }

  async findUsernameByAccount(accountId: string): Promise<string | null> {
    const { rows } = await this.executor.query<{ username: string }>(
      `SELECT username FROM bank_credentials WHERE account_id = $1 AND status = 'valid'`,
      [accountId]
    )
    return rows[0]?.username ?? null
  }

  async findByAccountId(accountId: string): Promise<BankCredentialsRecord | null> {
    const { rows } = await this.executor.query<BankCredentialsRow>(
      `SELECT account_id, username, status, last_validated_at
         FROM bank_credentials WHERE account_id = $1`,
      [accountId]
    )
    if (!rows[0]) return null
    return {
      accountId: rows[0].account_id,
      username: rows[0].username,
      status: rows[0].status,
      lastValidatedAt: rows[0].last_validated_at,
    }
  }

  async upsert(input: BankCredentialsInput): Promise<void> {
    validateBankCredentialsInput(input)
    const encryptedPassword = credentialsCipher().encrypt(input.encryptedPassword)
    await this.executor.query(
      `INSERT INTO bank_credentials (id, account_id, username, encrypted_password, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'valid')
       ON CONFLICT (account_id) DO UPDATE SET
         username           = $2,
         encrypted_password = $3,
         status             = 'valid',
         last_validated_at  = now()`,
      [input.accountId, input.username.trim(), encryptedPassword]
    )
  }

  async deleteByAccountId(accountId: string): Promise<void> {
    await this.executor.query(`DELETE FROM bank_credentials WHERE account_id = $1`, [accountId])
  }
}
