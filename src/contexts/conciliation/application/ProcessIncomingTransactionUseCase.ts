import crypto from 'crypto'
import { withTransaction } from '../../../shared/infrastructure/db/client.js'
import { EventBus } from '../../../shared/events/EventBus.js'
import { ConciliationEngine, CandidateTransaction, RequestData } from '../domain/ConciliationEngine.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import { ConciliationRequestRepository } from '../infrastructure/ConciliationRequestRepository.js'
import { ConciliationAttemptRepository } from '../infrastructure/ConciliationAttemptRepository.js'
import { ConciliatedTransactionRepository } from '../infrastructure/ConciliatedTransactionRepository.js'
import { BankTransactionRepository } from '../../banking/infrastructure/BankTransactionRepository.js'

interface JobData { transactionId: string }

export class ProcessIncomingTransactionUseCase {
  private engine = new ConciliationEngine()

  async execute({ transactionId }: JobData): Promise<void> {
    const matchedRequest = await withTransaction(async (client) => {
      const txRepo = new BankTransactionRepository(client)
      const requestRepo = new ConciliationRequestRepository(client)
      const attemptRepo = new ConciliationAttemptRepository(client)
      const matchRepo = new ConciliatedTransactionRepository(client)

      const tx = await txRepo.findById(transactionId, { forUpdate: true })
      if (!tx) return null
      // Idempotency: a previous match or no-match already excluded this tx.
      const excluded = await txRepo.isExcluded(transactionId)
      if (excluded) return null

      const candidate: CandidateTransaction = {
        id: tx.id,
        amount: tx.amount,
        currency: tx.currency,
        senderName: tx.senderName,
        receivedAt: tx.receivedAt,
      }

      const { rows: requestRows } = await client.query(
        `SELECT * FROM conciliation_requests
         WHERE account_id = $1
           AND status IN ('pending', 'not_found')
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED`,
        [tx.accountId]
      )

      let winner: ConciliationRequest | null = null
      for (const row of requestRows) {
        const req = ConciliationRequest.reconstitute(row.id, {
          accountId: row.account_id,
          externalId: row.external_id,
          expectedAmount: Number(row.expected_amount),
          currency: row.currency,
          senderName: row.sender_name ?? undefined,
          status: row.status,
          idempotencyKey: row.idempotency_key ?? undefined,
          retryCount: row.retry_count,
          lastCheckedAt: row.last_checked_at ?? undefined,
          createdAt: row.created_at,
        })
        const reqData: RequestData = {
          expectedAmount: req.expectedAmount,
          currency: req.currency,
          senderName: req.senderName,
          createdAt: req.createdAt,
        }
        const result = this.engine.evaluate(reqData, [candidate])
        if (result.status === 'matched') {
          winner = req
          break
        }
      }

      if (!winner) {
        await txRepo.markExcluded(transactionId)
        return null
      }

      winner.markProcessing()
      winner.markMatched(transactionId)

      await matchRepo.save({
        id: crypto.randomUUID(),
        accountId: winner.accountId,
        requestId: winner.id,
        bankTransactionId: transactionId,
      })

      await attemptRepo.save({
        id: crypto.randomUUID(),
        accountId: winner.accountId,
        requestId: winner.id,
        attemptNumber: winner.retryCount + 1,
        status: 'success',
        candidateIds: [transactionId],
        selectedTransactionId: transactionId,
      })

      await requestRepo.save(winner)
      await txRepo.markExcluded(transactionId)

      return winner
    })

    if (!matchedRequest) return

    await EventBus.publishAll(matchedRequest.domainEvents)
    matchedRequest.clearDomainEvents()
  }
}
