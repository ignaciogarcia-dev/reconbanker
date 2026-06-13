import { describe, it, expect, vi } from 'vitest'
import { RunConciliationUseCase } from './RunConciliationUseCase.js'
import { ConciliationEngine } from '../domain/ConciliationEngine.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import { InMemoryEventBus } from '../../../shared/events/InMemoryEventBus.js'
import {
  InMemoryConciliationRequestRepository,
  InMemoryConciliatedTransactionRepository,
  InMemoryConciliationAttemptRepository,
} from '../../../../tests/helpers/inMemoryConciliationRepos.js'
import { InMemoryUnitOfWork } from '../../../../tests/helpers/inMemoryUnitOfWork.js'
import type { IBankTransactionFinder } from '../domain/ports/IBankTransactionFinder.js'

function buildSut(candidates: any[]) {
  const requestRepo = new InMemoryConciliationRequestRepository()
  const matchRepo = new InMemoryConciliatedTransactionRepository()
  const attemptRepo = new InMemoryConciliationAttemptRepository()
  const eventBus = new InMemoryEventBus()
  const excluded = new Set<string>()
  const finder: any = {
    findCandidatesForAccount: async () => candidates,
    findById: async () => null,
    isExcluded: async (id: string) => excluded.has(id),
    markExcluded: async (id: string) => { excluded.add(id) },
  }
  // Rebound to the transaction so candidate reads and markExcluded share the
  // unit-of-work connection. The fake returns itself.
  finder.withTx = vi.fn(() => finder)
  const uow = new InMemoryUnitOfWork()
  const useCase = new RunConciliationUseCase({
    unitOfWork: uow, eventBus,
    requestRepo: requestRepo as any,
    attemptRepo: attemptRepo as any,
    matchRepo: matchRepo as any,
    bankTransactionFinder: finder as IBankTransactionFinder,
    engine: new ConciliationEngine(),
  })
  return { useCase, requestRepo, matchRepo, attemptRepo, eventBus, excluded, finder }
}

describe('RunConciliationUseCase', () => {
  it('marks matched when exactly one candidate matches', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const { useCase, requestRepo, matchRepo, attemptRepo, excluded } = buildSut([
      { id: 'tx-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
    ])
    requestRepo.store.set(req.id, req)

    await useCase.execute({ requestId: 'req-1' })

    expect(requestRepo.store.get('req-1')!.status).toBe('matched')
    expect(matchRepo.matches).toHaveLength(1)
    expect(matchRepo.matches[0].bankTransactionId).toBe('tx-1')
    expect(attemptRepo.attempts[0].status).toBe('success')
    expect(excluded.has('tx-1')).toBe(true)
  })

  it('marks not_found when no candidates match', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const { useCase, requestRepo, attemptRepo } = buildSut([])
    requestRepo.store.set(req.id, req)

    await useCase.execute({ requestId: 'req-1' })

    expect(requestRepo.store.get('req-1')!.status).toBe('not_found')
    expect(attemptRepo.attempts[0].status).toBe('no_match')
  })

  it('is a no-op for terminal requests', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD',
    })
    req.markCancelled()
    const { useCase, requestRepo, attemptRepo, matchRepo } = buildSut([])
    requestRepo.store.set(req.id, req)
    await useCase.execute({ requestId: 'req-1' })
    expect(attemptRepo.attempts).toHaveLength(0)
    expect(matchRepo.matches).toHaveLength(0)
  })

  it('is a no-op when the request does not exist', async () => {
    const { useCase, attemptRepo, matchRepo } = buildSut([])
    await useCase.execute({ requestId: 'missing' })
    expect(attemptRepo.attempts).toHaveLength(0)
    expect(matchRepo.matches).toHaveLength(0)
  })

  it('marks ambiguous and records multiple_candidates when several candidates match', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const { useCase, requestRepo, attemptRepo } = buildSut([
      { id: 'tx-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
      { id: 'tx-2', amount: 100, currency: 'USD', senderName: 'Alice L', receivedAt: new Date() },
    ])
    requestRepo.store.set(req.id, req)

    await useCase.execute({ requestId: 'req-1' })

    expect(requestRepo.store.get('req-1')!.status).toBe('ambiguous')
    expect(attemptRepo.attempts[0].status).toBe('ambiguous')
    expect(attemptRepo.attempts[0].failureType).toBe('multiple_candidates')
  })

  it('binds the bank-transaction finder to the unit-of-work transaction', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const { useCase, requestRepo, finder } = buildSut([
      { id: 'tx-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
    ])
    requestRepo.store.set(req.id, req)
    await useCase.execute({ requestId: 'req-1' })
    expect(finder.withTx).toHaveBeenCalledTimes(1)
  })

  it('aborts cleanly (no throw, no events) when another request already claimed the transaction', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const { useCase, requestRepo, matchRepo, eventBus } = buildSut([
      { id: 'tx-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
    ])
    requestRepo.store.set(req.id, req)
    const handler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('ConciliationMatched', handler)
    // The DB backstop fires because a concurrent execution won the race.
    matchRepo.save = async () => {
      const e: any = new Error('duplicate key value violates unique constraint')
      e.code = '23505'
      e.constraint = 'uq_conciliated_bank_tx_primary'
      throw e
    }

    await expect(useCase.execute({ requestId: 'req-1' })).resolves.toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
  })

  it('rethrows a non-unique-violation persistence error', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const { useCase, requestRepo, matchRepo } = buildSut([
      { id: 'tx-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
    ])
    requestRepo.store.set(req.id, req)
    matchRepo.save = async () => { throw new Error('connection terminated') }

    await expect(useCase.execute({ requestId: 'req-1' })).rejects.toThrow(/connection terminated/)
  })

  it('publishes domain events when match occurs', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const { useCase, requestRepo, eventBus } = buildSut([
      { id: 'tx-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
    ])
    requestRepo.store.set(req.id, req)
    const handler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('ConciliationMatched', handler)
    await useCase.execute({ requestId: 'req-1' })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
