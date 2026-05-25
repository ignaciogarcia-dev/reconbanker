import { describe, it, expect, vi } from 'vitest'
import { ProcessIncomingTransactionUseCase } from './ProcessIncomingTransactionUseCase.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import { MatchResult } from '../domain/MatchResult.js'

function makeRepos() {
  const requestRepo: any = {
    findPendingByAccount: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
  }
  requestRepo.withTx = vi.fn(() => requestRepo)

  const attemptRepo: any = {
    save: vi.fn().mockResolvedValue(undefined),
  }
  attemptRepo.withTx = vi.fn(() => attemptRepo)

  const matchRepo: any = {
    save: vi.fn().mockResolvedValue(undefined),
  }
  matchRepo.withTx = vi.fn(() => matchRepo)

  return { requestRepo, attemptRepo, matchRepo }
}

function makeDeps(overrides: {
  view?: any
  excluded?: boolean
  pending?: ConciliationRequest[]
  engineResult?: MatchResult
} = {}) {
  const { requestRepo, attemptRepo, matchRepo } = makeRepos()
  if (overrides.pending) {
    requestRepo.findPendingByAccount.mockResolvedValue(overrides.pending)
  }

  const unitOfWork = {
    run: vi.fn(async (work: any) => work({ query: vi.fn() })),
  }
  const eventBus = {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
  }
  const bankTransactionFinder = {
    findCandidatesForAccount: vi.fn(),
    findById: vi.fn().mockResolvedValue(overrides.view === undefined ? null : overrides.view),
    isExcluded: vi.fn().mockResolvedValue(overrides.excluded ?? false),
    markExcluded: vi.fn().mockResolvedValue(undefined),
  }
  const engine = {
    evaluate: vi.fn().mockReturnValue(overrides.engineResult ?? MatchResult.notFound()),
  }

  return {
    unitOfWork, eventBus, requestRepo, attemptRepo, matchRepo,
    bankTransactionFinder, engine,
  }
}

describe('ProcessIncomingTransactionUseCase', () => {
  it('does nothing when bank transaction view is not found', async () => {
    const deps = makeDeps({ view: null })
    const useCase = new ProcessIncomingTransactionUseCase(deps as any)
    await useCase.execute({ transactionId: 'tx-1' })
    expect(deps.requestRepo.findPendingByAccount).not.toHaveBeenCalled()
    expect(deps.eventBus.publishAll).not.toHaveBeenCalled()
  })

  it('does nothing when transaction is already excluded', async () => {
    const deps = makeDeps({
      view: { id: 'tx-1', accountId: 'acc-1', amount: 100, currency: 'USD', senderName: 'X', receivedAt: new Date() },
      excluded: true,
    })
    const useCase = new ProcessIncomingTransactionUseCase(deps as any)
    await useCase.execute({ transactionId: 'tx-1' })
    expect(deps.requestRepo.findPendingByAccount).not.toHaveBeenCalled()
    expect(deps.bankTransactionFinder.markExcluded).not.toHaveBeenCalled()
  })

  it('marks excluded and returns null when no matching request', async () => {
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const deps = makeDeps({
      view: { id: 'tx-1', accountId: 'acc-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
      pending: [req],
      engineResult: MatchResult.notFound(),
    })
    const useCase = new ProcessIncomingTransactionUseCase(deps as any)
    await useCase.execute({ transactionId: 'tx-1' })
    expect(deps.bankTransactionFinder.markExcluded).toHaveBeenCalledWith('tx-1')
    expect(deps.matchRepo.save).not.toHaveBeenCalled()
    expect(deps.attemptRepo.save).not.toHaveBeenCalled()
    expect(deps.eventBus.publishAll).not.toHaveBeenCalled()
  })

  it('matches first winner, saves match/attempt/request, marks excluded, publishes events', async () => {
    const winning = ConciliationRequest.create('req-win', {
      accountId: 'acc-1', externalId: 'ext-win',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const loser = ConciliationRequest.create('req-lose', {
      accountId: 'acc-1', externalId: 'ext-lose',
      expectedAmount: 200, currency: 'USD', senderName: 'Bob',
    })
    const deps = makeDeps({
      view: { id: 'tx-1', accountId: 'acc-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
      pending: [winning, loser],
    })
    deps.engine.evaluate
      .mockReturnValueOnce(MatchResult.matched('tx-1', ['tx-1']))

    const useCase = new ProcessIncomingTransactionUseCase(deps as any)
    await useCase.execute({ transactionId: 'tx-1' })

    expect(deps.matchRepo.save).toHaveBeenCalledTimes(1)
    expect(deps.matchRepo.save.mock.calls[0][0]).toMatchObject({
      accountId: 'acc-1',
      requestId: 'req-win',
      bankTransactionId: 'tx-1',
    })
    expect(deps.attemptRepo.save).toHaveBeenCalledTimes(1)
    expect(deps.attemptRepo.save.mock.calls[0][0]).toMatchObject({
      accountId: 'acc-1',
      requestId: 'req-win',
      attemptNumber: 1,
      status: 'success',
      candidateIds: ['tx-1'],
      selectedTransactionId: 'tx-1',
    })
    expect(deps.requestRepo.save).toHaveBeenCalledWith(winning)
    expect(deps.bankTransactionFinder.markExcluded).toHaveBeenCalledWith('tx-1')
    expect(deps.eventBus.publishAll).toHaveBeenCalledTimes(1)
    expect(winning.status).toBe('matched')
    expect(winning.domainEvents).toHaveLength(0)
    expect(deps.engine.evaluate).toHaveBeenCalledTimes(1)
  })

  it('breaks early on first matching candidate without evaluating remaining', async () => {
    const r1 = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const r2 = ConciliationRequest.create('req-2', {
      accountId: 'acc-1', externalId: 'ext-2',
      expectedAmount: 100, currency: 'USD', senderName: 'Alice',
    })
    const deps = makeDeps({
      view: { id: 'tx-1', accountId: 'acc-1', amount: 100, currency: 'USD', senderName: 'Alice', receivedAt: new Date() },
      pending: [r1, r2],
    })
    deps.engine.evaluate
      .mockReturnValueOnce(MatchResult.notFound())
      .mockReturnValueOnce(MatchResult.matched('tx-1', ['tx-1']))

    const useCase = new ProcessIncomingTransactionUseCase(deps as any)
    await useCase.execute({ transactionId: 'tx-1' })
    expect(deps.engine.evaluate).toHaveBeenCalledTimes(2)
    expect(deps.requestRepo.save).toHaveBeenCalledWith(r2)
  })
})
