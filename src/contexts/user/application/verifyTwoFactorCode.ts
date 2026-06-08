import { User } from '../domain/User.js'
import { ITotpProvider } from '../domain/ports/ITotpProvider.js'
import { IBackupCodeRepository } from '../domain/IBackupCodeRepository.js'
import { IPasswordHasher } from '../domain/ports/IPasswordHasher.js'
import { normalizeBackupCode } from './backupCodes.js'

export interface TwoFactorDeps {
  totp: ITotpProvider
  backupCodes: IBackupCodeRepository
  hasher: IPasswordHasher
}

/**
 * Accepts either a current TOTP code or one of the user's unused backup codes.
 * A matching backup code is consumed (single-use). Returns false on no match.
 */
export async function verifyTwoFactorCode(
  user: User,
  code: string,
  deps: TwoFactorDeps,
): Promise<boolean> {
  const trimmed = code.trim()
  if (user.totpSecret && (await deps.totp.verify(user.totpSecret, trimmed))) {
    return true
  }
  const normalized = normalizeBackupCode(trimmed)
  if (!normalized) return false
  const active = await deps.backupCodes.listActive(user.id)
  for (const bc of active) {
    if (await deps.hasher.verify(normalized, bc.codeHash)) {
      // Consume atomically: markUsed only succeeds if the code was still
      // unused, so two concurrent requests racing on the same code cannot
      // both be accepted.
      return await deps.backupCodes.markUsed(bc.id)
    }
  }
  return false
}
