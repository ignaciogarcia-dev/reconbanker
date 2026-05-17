import crypto from 'crypto'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import {
  ConciliationEngine,
  CandidateTransaction,
  RequestData,
} from '../domain/ConciliationEngine.js'
import { ConciliationRequestRepository } from '../infrastructure/ConciliationRequestRepository.js'
import { ConciliationAttemptRepository } from '../infrastructure/ConciliationAttemptRepository.js'
import { ConciliatedTransactionRepository } from '../infrastructure/ConciliatedTransactionRepository.js'
import { IBankTransactionFinder } from '../domain/ports/IBankTransactionFinder.js'

interface JobData { transactionId: string }

export interface ProcessIncomingTransactionDeps {
  unitOfWork: IUnitOfWork
  eventBus: IEventBus
  requestRepo: ConciliationRequestRepository
  attemptRepo: ConciliationAttemptRepository
  matchRepo: ConciliatedTransactionRepository
  bankTransactionFinder: IBankTransactionFinder
  engine: ConciliationEngine
}

export class ProcessIncomingTransactionUseCase {
  constructor(private readonly deps: ProcessIncomingTransactionDeps) {}

  async execute({ transactionId }: JobData): Promise<void> {
    const { unitOfWork, eventBus, engine, requestRepo, attemptRepo, matchRepo, bankTransactionFinder } = this.deps

    const matchedRequest = await unitOfWork.run(async (tx) => {
      const txRequestRepo = requestRepo.withTx(tx)
      const txAttemptRepo = attemptRepo.withTx(tx)
      const txMatchRepo = matchRepo.withTx(tx)

      const view = await bankTransactionFinder.findById(transactionId, { forUpdate: true })
      if (!view) return null
      if (await bankTransactionFinder.isExcluded(transactionId)) return null

      const candidate: CandidateTransaction = {
        id: view.id,
        amount: view.amount,
        currency: view.currency,
        senderName: view.senderName,
        receivedAt: view.receivedAt,
      }

      const requests = await txRequestRepo.findPendingByAccount(view.accountId)

      let winner = null
      for (const req of requests) {
        const reqData: RequestData = {
          expectedAmount: req.expectedAmount,
          currency: req.currency,
          senderName: req.senderName,
          createdAt: req.createdAt,
        }
        const result = engine.evaluate(reqData, [candidate])
        if (result.status === 'matched') {
          winner = req
          break
        }
      }

      if (!winner) {
        await bankTransactionFinder.markExcluded(transactionId)
        return null
      }

      winner.markProcessing()
      winner.markMatched(transactionId)

      await txMatchRepo.save({
        id: crypto.randomUUID(),
        accountId: winner.accountId,
        requestId: winner.id,
        bankTransactionId: transactionId,
      })

      await txAttemptRepo.save({
        id: crypto.randomUUID(),
        accountId: winner.accountId,
        requestId: winner.id,
        attemptNumber: winner.retryCount + 1,
        status: 'success',
        candidateIds: [transactionId],
        selectedTransactionId: transactionId,
      })

      await txRequestRepo.save(winner)
      await bankTransactionFinder.markExcluded(transactionId)
      return winner
    })

    if (!matchedRequest) return

    await eventBus.publishAll(matchedRequest.domainEvents)
    matchedRequest.clearDomainEvents()
  }
}
