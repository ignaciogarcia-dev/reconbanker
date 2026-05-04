import { db } from '../../../shared/infrastructure/db/client.js'
import { Queues } from '../../../shared/infrastructure/queues/QueueRegistry.js'
import { BankTransactionRepository } from '../../banking/infrastructure/BankTransactionRepository.js'
import { IBankTransactionRepository } from '../../banking/domain/IBankTransactionRepository.js'
import { TransactionIngestedEvent } from '../../../shared/events/events/TransactionIngested.event.js'
import { logger } from '../../../shared/infrastructure/logger/index.js'

const log = logger.child('[conciliation]')

export class OnTransactionIngestedUseCase {
  constructor(
    private readonly txRepo: IBankTransactionRepository = new BankTransactionRepository(),
  ) {}

  async execute(event: TransactionIngestedEvent): Promise<void> {
    const txId = event.aggregateId

    const { rows } = await db.query(
      `SELECT 1 FROM conciliation_requests
       WHERE account_id = $1
         AND status IN ('pending', 'not_found')
       LIMIT 1`,
      [event.accountId]
    )

    if (rows.length === 0) {
      await this.txRepo.markExcluded(txId)
      log.info(`tx excluded — no active requests`, { txId })
      return
    }

    await Queues.txConciliation.add(
      'process',
      { transactionId: txId },
      { jobId: `tx_conciliation_${txId}`, removeOnComplete: true }
    )
    log.info(`tx enqueued for tx-conciliation`, { txId })
  }
}
