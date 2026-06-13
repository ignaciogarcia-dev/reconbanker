import crypto from 'crypto'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { isUniqueViolation } from '../../../shared/persistence/pgErrors.js'
import { logger } from '../../../shared/logger/index.js'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { ConciliationEngine } from '../domain/ConciliationEngine.js'
import { ConciliationRequestRepository } from '../infrastructure/ConciliationRequestRepository.js'
import { ConciliationAttemptRepository } from '../infrastructure/ConciliationAttemptRepository.js'
import { ConciliatedTransactionRepository } from '../infrastructure/ConciliatedTransactionRepository.js'
import { IBankTransactionFinder } from '../domain/ports/IBankTransactionFinder.js'

interface JobData { requestId: string }

export interface RunConciliationDeps {
  unitOfWork: IUnitOfWork
  eventBus: IEventBus
  requestRepo: ConciliationRequestRepository
  attemptRepo: ConciliationAttemptRepository
  matchRepo: ConciliatedTransactionRepository
  bankTransactionFinder: IBankTransactionFinder
  engine: ConciliationEngine
}

export class RunConciliationUseCase {
  constructor(private readonly deps: RunConciliationDeps) {}

  async execute({ requestId }: JobData): Promise<void> {
    const { unitOfWork, eventBus, engine, requestRepo, attemptRepo, matchRepo, bankTransactionFinder } = this.deps

    let outcome: { request: import('../domain/ConciliationRequest.js').ConciliationRequest; resultStatus: string } | null
    try {
      outcome = await unitOfWork.run(async (tx) => {
      const txRequestRepo = requestRepo.withTx(tx)
      const txAttemptRepo = attemptRepo.withTx(tx)
      const txMatchRepo = matchRepo.withTx(tx)
      const txFinder = bankTransactionFinder.withTx(tx)

      const request = await txRequestRepo.findByIdForUpdate(requestId)
      if (!request) return null
      if (request.isTerminal()) return null

      const candidates = await txFinder.findCandidatesForAccount(request.accountId)

      const result = engine.evaluate(
        {
          expectedAmount: request.expectedAmount,
          currency: request.currency,
          senderName: request.senderName,
          createdAt: request.createdAt,
        },
        candidates
      )

      const attemptId = crypto.randomUUID()
      const attemptNumber = request.retryCount + 1

      request.markProcessing()

      if (result.status === 'matched') {
        request.markMatched(result.transactionId!)
        await txMatchRepo.save({
          id: crypto.randomUUID(),
          accountId: request.accountId,
          requestId,
          bankTransactionId: result.transactionId!,
        })
        await txFinder.markExcluded(result.transactionId!)
        await txAttemptRepo.save({
          id: attemptId,
          accountId: request.accountId,
          requestId,
          attemptNumber,
          status: 'success',
          candidateIds: result.candidateIds,
          selectedTransactionId: result.transactionId,
        })
      } else {
        if (result.status === 'ambiguous') request.markAmbiguous()
        else request.markNotFound()
        await txAttemptRepo.save({
          id: attemptId,
          accountId: request.accountId,
          requestId,
          attemptNumber,
          status: result.status === 'ambiguous' ? 'ambiguous' : 'no_match',
          failureType: result.status === 'ambiguous' ? 'multiple_candidates' : 'rule_miss',
          candidateIds: result.candidateIds,
        })
      }

      await txRequestRepo.save(request)
      return { request, resultStatus: result.status }
      })
    } catch (err) {
      // The 043 partial unique index (the loser of a concurrent double-match)
      // means another execution already conciliated this transaction. Abort
      // cleanly: the unit of work rolled back, and a later run re-evaluates the
      // request against the now-excluded transaction.
      if (isUniqueViolation(err, 'uq_conciliated_bank_tx_primary')) {
        logger.info('[conciliation] lost double-match race; another request claimed the transaction', { requestId })
        return
      }
      throw err
    }

    if (!outcome) return

    await eventBus.publishAll(outcome.request.domainEvents)
    outcome.request.clearDomainEvents()
  }
}
