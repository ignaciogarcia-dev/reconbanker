import { User, OperationMode, UserStatus } from '../../domain/User.js'

export interface UserRow {
  id: string
  email: string
  name: string | null
  password_hash: string
  operation_mode: OperationMode | null
  status: UserStatus | null
  created_at: Date | null
}

export const UserRowMapper = {
  toAggregate(row: UserRow): User {
    return User.reconstitute(row.id, {
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      operationMode: row.operation_mode,
      status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date(0),
    })
  },
}
