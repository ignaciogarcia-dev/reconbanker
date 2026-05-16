import { db } from '../../../shared/infrastructure/db/client.js'
import { IUserRepository } from '../domain/IUserRepository.js'
import { OperationMode, User } from '../domain/User.js'

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    const { rows } = await db.query(
      `SELECT id, email, name, operation_mode FROM users WHERE id = $1`,
      [id]
    )
    if (!rows[0]) return null
    return {
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].name,
      operationMode: rows[0].operation_mode as OperationMode | null,
    }
  }

  async getOperationMode(userId: string): Promise<OperationMode | null> {
    const { rows } = await db.query(
      `SELECT operation_mode FROM users WHERE id = $1`,
      [userId]
    )
    return (rows[0]?.operation_mode as OperationMode | null) ?? null
  }

  async setOperationMode(userId: string, mode: OperationMode): Promise<void> {
    await db.query(`UPDATE users SET operation_mode = $2 WHERE id = $1`, [userId, mode])
  }
}
