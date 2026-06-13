import { randomUUID } from 'node:crypto'
import type { BackupCode, IBackupCodeRepository } from '../../src/contexts/user/domain/IBackupCodeRepository.js'

interface Row { id: string; userId: string; codeHash: string; used: boolean }

export class InMemoryBackupCodeRepository implements IBackupCodeRepository {
  rows: Row[] = []

  withTx() { return this }

  async replaceForUser(userId: string, codeHashes: string[]) {
    this.rows = this.rows.filter((r) => r.userId !== userId)
    for (const codeHash of codeHashes) {
      this.rows.push({ id: randomUUID(), userId, codeHash, used: false })
    }
  }

  async listActive(userId: string): Promise<BackupCode[]> {
    return this.rows
      .filter((r) => r.userId === userId && !r.used)
      .map((r) => ({ id: r.id, codeHash: r.codeHash }))
  }

  async markUsed(id: string): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id)
    if (!row || row.used) return false
    row.used = true
    return true
  }

  async deleteForUser(userId: string) {
    this.rows = this.rows.filter((r) => r.userId !== userId)
  }
}
