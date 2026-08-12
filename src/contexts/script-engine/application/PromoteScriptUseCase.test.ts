import { describe, it, expect, vi } from 'vitest'
import { PromoteScriptUseCase } from './PromoteScriptUseCase.js'
import { BankScript } from '../domain/BankScript.js'
import { InMemoryBankScriptRepository } from '../../../../tests/helpers/inMemoryScriptRepo.js'
import { InMemoryUnitOfWork } from '../../../../tests/helpers/inMemoryUnitOfWork.js'
import { InMemoryEventBus } from '../../../shared/events/InMemoryEventBus.js'
import { ForbiddenError, NotFoundError } from '../../../shared/errors/index.js'

const OWNER = 'user-1'
const OTHER = 'user-2'

const baseProps = {
  bank: 'TEST',
  flowType: 'extract_transactions' as const,
  version: '1.0.0',
  origin: 'user' as const,
  selectorMap: {},
}

describe('PromoteScriptUseCase', () => {
  it("promotes the caller's own script and deprecates their previously active one, without any role check", async () => {
    const repo = new InMemoryBankScriptRepository()
    const previous = BankScript.create('prev', { ...baseProps, version: '0.9.0', status: 'active', userId: OWNER })
    const candidate = BankScript.create('next', { ...baseProps, version: '1.0.0', status: 'review', userId: OWNER })
    repo.store.set(previous.id, previous)
    repo.store.set(candidate.id, candidate)

    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await useCase.execute({ scriptId: 'next', callerId: OWNER })

    expect(repo.store.get('next')!.status).toBe('active')
    expect(repo.store.get('prev')!.status).toBe('deprecated')
  })

  it('publishes a ScriptPromoted event after the transaction commits', async () => {
    const repo = new InMemoryBankScriptRepository()
    const candidate = BankScript.create('next', { ...baseProps, status: 'review', userId: OWNER })
    repo.store.set(candidate.id, candidate)
    const bus = new InMemoryEventBus()
    const handler = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('ScriptPromoted', handler)

    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), bus)
    await useCase.execute({ scriptId: 'next', callerId: OWNER })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('throws NotFoundError when the script does not exist', async () => {
    const repo = new InMemoryBankScriptRepository()
    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await expect(useCase.execute({ scriptId: 'missing', callerId: OWNER })).rejects.toBeInstanceOf(NotFoundError)
  })

  it("throws NotFoundError (masking existence) when the script is privately owned by someone else", async () => {
    const repo = new InMemoryBankScriptRepository()
    const candidate = BankScript.create('next', { ...baseProps, status: 'review', userId: OWNER })
    repo.store.set(candidate.id, candidate)

    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await expect(useCase.execute({ scriptId: 'next', callerId: OTHER })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws ForbiddenError when a regular caller tries to promote a system script', async () => {
    const repo = new InMemoryBankScriptRepository()
    const candidate = BankScript.create('next', { ...baseProps, origin: 'system', status: 'review' })
    repo.store.set(candidate.id, candidate)

    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await expect(useCase.execute({ scriptId: 'next', callerId: OWNER })).rejects.toBeInstanceOf(ForbiddenError)
  })
})
