import crypto from 'crypto'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import { IConciliationRequestRepository } from '../domain/IConciliationRequestRepository.js'
import { IAccountConfigReader } from '../domain/ports/IAccountConfigReader.js'
import { IAccountReader } from '../domain/ports/IAccountReader.js'
import { IUserOperationModeReader } from '../domain/ports/IUserOperationModeReader.js'
import { IOrderSource } from '../domain/ports/IOrderSource.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

interface JobData { accountId: string }

export interface PollPendingOrdersDeps {
  requestRepo: IConciliationRequestRepository
  configReader: IAccountConfigReader
  accountReader: IAccountReader
  userModeReader: IUserOperationModeReader
  orderSource: IOrderSource
  enqueueRun: (requestId: string) => Promise<void>
  logger?: ILogger
}

export class PollPendingOrdersUseCase {
  constructor(private readonly deps: PollPendingOrdersDeps) {}

  async execute({ accountId }: JobData): Promise<void> {
    const { requestRepo, configReader, accountReader, userModeReader, orderSource, enqueueRun, logger } = this.deps

    const config = await configReader.findPollingConfig(accountId)
    if (!config) throw new NotFoundError(`No config for account ${accountId}`)

    const account = await accountReader.findById(accountId)
    if (!account) throw new NotFoundError(`No account ${accountId}`)

    const mode = await userModeReader.getOperationMode(account.userId)
    if (mode !== 'reconcile') return
    if (!config.pendingOrdersEndpoint) return

    const orders = await orderSource.fetch(config)

    const existing = await requestRepo.findActiveExternalIds(accountId)
    const seenExternalIds: string[] = []

    for (const order of orders) {
      seenExternalIds.push(order.externalId)
      if (existing.has(order.externalId)) continue

      const request = ConciliationRequest.create(crypto.randomUUID(), {
        accountId,
        externalId: order.externalId,
        expectedAmount: order.amount,
        currency: order.currency,
        senderName: order.senderName,
      })
      // Conflict-safe insert: under concurrent polls only the winner inserts
      // and enqueues, so a duplicate (account_id, external_id) never crashes the
      // job nor double-enqueues.
      const created = await requestRepo.createIfAbsent(request)
      if (created) await enqueueRun(request.id)
    }

    const cancelledCount = await requestRepo.cancelMissing(accountId, seenExternalIds)
    if (cancelledCount > 0) {
      logger?.info('cancelled orders missing from source', { accountId, cancelledCount })
    }
  }
}
