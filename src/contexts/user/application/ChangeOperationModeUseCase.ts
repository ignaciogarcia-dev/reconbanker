import { withTransaction } from '../../../shared/infrastructure/db/client.js'
import { OperationMode } from '../domain/User.js'

interface Input {
  userId: string
  mode: OperationMode
}

/**
 * Changing the operation mode permanently deletes the user's movements and
 * conciliations: data processed under one mode cannot be carried over to the
 * other (security / compliance). Runs atomically so a partial wipe can't leave
 * the user in a mixed state.
 */
export class ChangeOperationModeUseCase {
  async execute({ userId, mode }: Input): Promise<{ mode: OperationMode }> {
    await withTransaction(async (client) => {
      const scope = `account_id IN (SELECT id FROM accounts WHERE user_id = $1)`
      await client.query(`DELETE FROM conciliated_transactions WHERE ${scope}`, [userId])
      await client.query(`DELETE FROM conciliation_attempts WHERE ${scope}`, [userId])
      await client.query(`DELETE FROM conciliation_requests WHERE ${scope}`, [userId])
      await client.query(`DELETE FROM bank_transactions WHERE ${scope}`, [userId])
      await client.query(`UPDATE users SET operation_mode = $2 WHERE id = $1`, [userId, mode])
    })
    return { mode }
  }
}
