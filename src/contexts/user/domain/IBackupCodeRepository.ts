export interface BackupCode {
  id: string
  codeHash: string
}

/**
 * Persistence for one-time 2FA recovery codes. Codes are stored as bcrypt
 * hashes; consumption is single-use via markUsed.
 */
export interface IBackupCodeRepository {
  /** Replaces all of a user's codes with a fresh batch (used on enrollment confirm). */
  replaceForUser(userId: string, codeHashes: string[]): Promise<void>
  /** Returns the user's unused codes. */
  listActive(userId: string): Promise<BackupCode[]>
  /** Marks a single code as consumed. */
  markUsed(id: string): Promise<void>
  /** Removes all of a user's codes (used when 2FA is disabled). */
  deleteForUser(userId: string): Promise<void>
}
