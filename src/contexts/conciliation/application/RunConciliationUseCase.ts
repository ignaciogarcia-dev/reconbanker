import { db, withTransaction } from '../../../shared/infrastructure/db/client.js'
import { EventBus } from '../../../shared/events/EventBus.js'
import { ConciliationEngine } from '../domain/ConciliationEngine.js'
import { IConciliationRequestRepository } from '../domain/IConciliationRequestRepository.js'
import { IConciliationAttemptRepository } from '../domain/IConciliationAttemptRepository.js'
import { IConciliatedTransactionRepository } from '../domain/IConciliatedTransactionRepository.js'
import { ConciliationRequestRepository } from '../infrastructure/ConciliationRequestRepository.js'
import { ConciliationAttemptRepository } from '../infrastructure/ConciliationAttemptRepository.js'
import { ConciliatedTransactionRepository } from '../infrastructure/ConciliatedTransactionRepository.js'
import crypto from 'crypto'

interface JobData { requestId: string }

export class RunConciliationUseCase {
  private engine = new ConciliationEngine()

  constructor(
    private readonly requestRepo: IConciliationRequestRepository = new ConciliationRequestRepository(),
    private readonly attemptRepo: IConciliationAttemptRepository = new ConciliationAttemptRepository(),
    private readonly matchRepo: IConciliatedTransactionRepository = new ConciliatedTransactionRepository(),
  ) {}

  async execute({ requestId }: JobData): Promise<void> {
    const request = await this.requestRepo.findById(requestId)
    if (!request || request.status === 'matched') return

    const { rows: candidateRows } = await db.query(
      `SELECT id, amount, currency, sender_name, received_at
       FROM bank_transactions
       WHERE account_id = $1 AND received_at >= now() - interval '7 days'`,
      [request.accountId]
    )

    const result = this.engine.evaluate(
      {
        expectedAmount: request.expectedAmount,
        currency: request.currency,
        senderName: request.senderName,
        createdAt: request.createdAt,
      },
      candidateRows.map(c => ({
        id: c.id,
        amount: Number(c.amount),
        currency: c.currency,
        senderName: c.sender_name,
        receivedAt: c.received_at,
      }))
    )

    const attemptId = crypto.randomUUID()
    const attemptNumber = request.retryCount + 1

    await withTransaction(async (client) => {
      const txRequestRepo = new ConciliationRequestRepository(client)
      const txAttemptRepo = new ConciliationAttemptRepository(client)
      const txMatchRepo = new ConciliatedTransactionRepository(client)

      request.markProcessing()

      if (result.status === 'matched') {
        request.markMatched(result.transactionId!)
        await txMatchRepo.save({
          id: crypto.randomUUID(),
          accountId: request.accountId,
          requestId,
          bankTransactionId: result.transactionId!,
        })
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
        if (result.status === 'ambiguous') {
          request.markAmbiguous()
        } else {
          request.markNotFound()
        }
        await txAttemptRepo.save({
          id: attemptId,
          accountId: request.accountId,
          requestId,
          attemptNumber,
          status: result.status === 'ambiguous' ? 'ambiguous' : 'not_found',
          failureType: result.status === 'ambiguous' ? 'multiple_candidates' : 'rule_miss',
          candidateIds: result.candidateIds,
        })
      }

      await txRequestRepo.save(request)
    })

    await EventBus.publishAll(request.domainEvents)
    request.clearDomainEvents()
  }
}
