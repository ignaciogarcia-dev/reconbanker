import { randomUUID } from 'node:crypto'
import type { BackupCode, IBackupCodeRepository } from '../../src/contexts/user/domain/IBackupCodeRepository.js'

interface Row { id: string; userId: string; codeHash: string; used: boolean }

export class InMemoryBackupCodeRepository implements IBackupCodeRepository {
  rows: Row[] = []

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

  async markUsed(id: string) {
    const row = this.rows.find((r) => r.id === id)
    if (row) row.used = true
  }

  async deleteForUser(userId: string) {
    this.rows = this.rows.filter((r) => r.userId !== userId)
  }
}
