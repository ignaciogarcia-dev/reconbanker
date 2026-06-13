import { User, OperationMode, UserStatus } from '../../domain/User.js'

export interface UserRow {
  id: string
  email: string
  name: string | null
  password_hash: string
  operation_mode: OperationMode | null
  status: UserStatus | null
  created_at: Date | null
  totp_secret?: string | null
  totp_enabled?: boolean | null
  totp_confirmed_at?: Date | null
  // pg returns BIGINT as a string; the mapper coerces it to a number.
  totp_last_step?: number | string | null
}

export const UserRowMapper = {
  /**
   * Maps a DB row to the User aggregate. `totpSecret` must already be decrypted
   * by the repository — the domain only ever sees the plaintext Base32 secret.
   */
  toAggregate(row: UserRow): User {
    return User.reconstitute(row.id, {
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      operationMode: row.operation_mode,
      status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date(0),
      totpSecret: row.totp_secret ?? null,
      totpEnabled: row.totp_enabled ?? false,
      totpConfirmedAt: row.totp_confirmed_at ?? null,
      totpLastStep: row.totp_last_step != null ? Number(row.totp_last_step) : null,
    })
  },
}
