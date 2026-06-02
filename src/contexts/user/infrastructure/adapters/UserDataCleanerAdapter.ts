import { IUserDataCleaner } from '../../domain/ports/IUserDataCleaner.js'
import type { Tx } from '../../../../shared/persistence/Tx.js'

/**
 * Deletes the user's bank movements and conciliation history when their
 * operation mode is switched. The two modes process data with different
 * compliance constraints, so carrying records across modes is not allowed.
 */
export class UserDataCleanerAdapter implements IUserDataCleaner {
  async wipeForUser(tx: Tx, userId: string): Promise<void> {
    const scope = `account_id IN (SELECT id FROM accounts WHERE user_id = $1)`
    await tx.query(`DELETE FROM webhook_dead_letters WHERE ${scope}`, [userId])
    await tx.query(`DELETE FROM webhook_notifications WHERE ${scope}`, [userId])
    await tx.query(`DELETE FROM conciliated_transactions WHERE ${scope}`, [userId])
    await tx.query(`DELETE FROM conciliation_attempts WHERE ${scope}`, [userId])
    await tx.query(`DELETE FROM conciliation_requests WHERE ${scope}`, [userId])
    await tx.query(`DELETE FROM bank_transactions WHERE ${scope}`, [userId])
  }
}
