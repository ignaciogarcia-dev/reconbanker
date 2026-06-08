import { BackupCode, IBackupCodeRepository } from '../domain/IBackupCodeRepository.js'
import { Executor } from './Executor.js'

interface BackupCodeRow {
  id: string
  code_hash: string
}

export class BackupCodeRepository implements IBackupCodeRepository {
  constructor(private readonly executor: Executor) {}

  async replaceForUser(userId: string, codeHashes: string[]): Promise<void> {
    await this.executor.query(`DELETE FROM user_backup_codes WHERE user_id = $1`, [userId])
    for (const hash of codeHashes) {
      await this.executor.query(
        `INSERT INTO user_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
        [userId, hash]
      )
    }
  }

  async listActive(userId: string): Promise<BackupCode[]> {
    const { rows } = await this.executor.query<BackupCodeRow>(
      `SELECT id, code_hash FROM user_backup_codes
        WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    )
    return rows.map((r) => ({ id: r.id, codeHash: r.code_hash }))
  }

  async markUsed(id: string): Promise<boolean> {
    const { rowCount } = await this.executor.query(
      `UPDATE user_backup_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
      [id]
    )
    return (rowCount ?? 0) > 0
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.executor.query(`DELETE FROM user_backup_codes WHERE user_id = $1`, [userId])
  }
}
