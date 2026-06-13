import type { Tx } from '../../../shared/persistence/index.js'

export interface BackupCode {
  id: string
  codeHash: string
}

/**
 * Persistence for one-time 2FA recovery codes. Codes are stored as bcrypt
 * hashes; consumption is single-use via markUsed.
 */
export interface IBackupCodeRepository {
  /** Rebinds to a unit-of-work transaction so writes are atomic with the user save. */
  withTx(tx: Tx): IBackupCodeRepository
  /** Replaces all of a user's codes with a fresh batch (used on enrollment confirm). */
  replaceForUser(userId: string, codeHashes: string[]): Promise<void>
  /** Returns the user's unused codes. */
  listActive(userId: string): Promise<BackupCode[]>
  /**
   * Atomically consumes a single code. Returns true only if this call was the
   * one that marked it used (i.e. it was still unused), so concurrent callers
   * racing on the same code cannot both succeed.
   */
  markUsed(id: string): Promise<boolean>
  /** Removes all of a user's codes (used when 2FA is disabled). */
  deleteForUser(userId: string): Promise<void>
}
