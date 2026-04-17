import { withTransaction } from '../../../shared/infrastructure/db/client.js'
import { EventBus } from '../../../shared/events/EventBus.js'
import { ConciliationEngine } from '../domain/ConciliationEngine.js'
import { ConciliationRequestRepository } from '../infrastructure/ConciliationRequestRepository.js'
import { ConciliationAttemptRepository } from '../infrastructure/ConciliationAttemptRepository.js'
import { ConciliatedTransactionRepository } from '../infrastructure/ConciliatedTransactionRepository.js'
import { Queues } from '../../../shared/infrastructure/queues/QueueRegistry.js'
import crypto from 'crypto'

interface JobData { requestId: string }

export class RunConciliationUseCase {
  private engine = new ConciliationEngine()

  async execute({ requestId }: JobData): Promise<void> {
    const TERMINAL_STATUSES = ['matched', 'cancelled', 'expired']

    const outcome = await withTransaction(async (client) => {
      const txRequestRepo = new ConciliationRequestRepository(client)
      const txAttemptRepo = new ConciliationAttemptRepository(client)
      const txMatchRepo = new ConciliatedTransactionRepository(client)

      // FOR UPDATE SKIP LOCKED: si polling tiene la row lockeada, retornamos null.
      const request = await txRequestRepo.findById(requestId)
      if (!request) return null
      if (TERMINAL_STATUSES.includes(request.status)) return null

      const { rows: candidateRows } = await client.query(
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

      return { request, resultStatus: result.status }
    })

    if (!outcome) return

    await EventBus.publishAll(outcome.request.domainEvents)
    outcome.request.clearDomainEvents()

    if (outcome.resultStatus === 'ambiguous') {
      await Queues.webhook.add(
        'notify',
        { requestId },
        { jobId: `webhook_ambiguous_${requestId}`, removeOnComplete: true }
      )
    }
  }
}
