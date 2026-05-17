import type { Tx } from '../../../../shared/persistence/Tx.js'

/**
 * Wipes user-scoped data from other bounded contexts as part of an atomic
 * operation mode change. Implemented in infrastructure because the wipe is
 * inherently persistence-level (cross-table DELETEs).
 */
export interface IUserDataCleaner {
  wipeForUser(tx: Tx, userId: string): Promise<void>
}
