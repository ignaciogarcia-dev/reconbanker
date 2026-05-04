import { db } from '../../../shared/infrastructure/db/client.js'
import { EventBus } from '../../../shared/events/EventBus.js'
import { ConciliationRequestRepository } from '../infrastructure/ConciliationRequestRepository.js'
import { Queues } from '../../../shared/infrastructure/queues/QueueRegistry.js'
import { logger } from '../../../shared/infrastructure/logger/index.js'

const log = logger.child('[conciliation]')

export class ExpireStaleRequestsUseCase {
  private readonly requestRepo = new ConciliationRequestRepository()

  async execute(): Promise<void> {
    const { rows } = await db.query(
      `SELECT cr.id, ac.notify_on_expired
       FROM conciliation_requests cr
       JOIN account_config ac ON ac.account_id = cr.account_id
       WHERE cr.status IN ('pending', 'not_found')
         AND cr.created_at <= now() - interval '5 days'`
    )

    for (const row of rows) {
      const request = await this.requestRepo.findById(row.id)
      if (!request) continue

      request.markExpired()
      await this.requestRepo.save(request)

      if (row.notify_on_expired) {
        await Queues.webhook.add(
          'notify',
          { requestId: request.id },
          { jobId: `webhook_expired_${request.id}`, removeOnComplete: true }
        )
      }

      await EventBus.publishAll(request.domainEvents)
      request.clearDomainEvents()
    }

    if (rows.length > 0) {
      log.info(`expired stale requests`, { count: rows.length })
    }
  }
}
