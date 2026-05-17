import { IEventBus } from '../../../shared/events/IEventBus.js'
import { IConciliationRequestRepository } from '../domain/IConciliationRequestRepository.js'
import { IAccountConfigReader } from '../domain/ports/IAccountConfigReader.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

export interface ExpireStaleRequestsDeps {
  requestRepo: IConciliationRequestRepository
  configReader: IAccountConfigReader
  eventBus: IEventBus
  enqueueWebhook: (requestId: string) => Promise<void>
  logger?: ILogger
  now?: () => Date
}

export class ExpireStaleRequestsUseCase {
  constructor(private readonly deps: ExpireStaleRequestsDeps) {}

  async execute(): Promise<void> {
    const { requestRepo, configReader, eventBus, enqueueWebhook, logger } = this.deps
    const now = this.deps.now ?? (() => new Date())

    const cutoff = new Date(now().getTime() - FIVE_DAYS_MS)
    const stale = await requestRepo.findStale(cutoff)

    for (const ref of stale) {
      const request = await requestRepo.findById(ref.id)
      if (!request) continue

      request.markExpired()
      if (request.domainEvents.length === 0) continue

      await requestRepo.save(request)

      if (await configReader.shouldNotifyOnExpired(ref.accountId)) {
        await enqueueWebhook(request.id)
      }

      await eventBus.publishAll(request.domainEvents)
      request.clearDomainEvents()
    }

    if (stale.length > 0) {
      logger?.info('expired stale requests', { count: stale.length })
    }
  }
}
