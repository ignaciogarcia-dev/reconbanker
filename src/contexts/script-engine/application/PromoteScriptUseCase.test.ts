import { describe, it, expect, vi } from 'vitest'
import { PromoteScriptUseCase } from './PromoteScriptUseCase.js'
import { BankScript } from '../domain/BankScript.js'
import { InMemoryBankScriptRepository } from '../../../../tests/helpers/inMemoryScriptRepo.js'
import { InMemoryUnitOfWork } from '../../../../tests/helpers/inMemoryUnitOfWork.js'
import { InMemoryEventBus } from '../../../shared/events/InMemoryEventBus.js'
import { NotFoundError } from '../../../shared/errors/index.js'

const baseProps = {
  bank: 'TEST',
  flowType: 'extract_transactions' as const,
  version: '1.0.0',
  origin: 'system' as const,
  selectorMap: {},
}

describe('PromoteScriptUseCase', () => {
  it('promotes the script and deprecates the previously active one', async () => {
    const repo = new InMemoryBankScriptRepository()
    const previous = BankScript.create('prev', { ...baseProps, version: '0.9.0', status: 'active' })
    const candidate = BankScript.create('next', { ...baseProps, version: '1.0.0', status: 'review' })
    repo.store.set(previous.id, previous)
    repo.store.set(candidate.id, candidate)

    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await useCase.execute({ scriptId: 'next' })

    expect(repo.store.get('next')!.status).toBe('active')
    expect(repo.store.get('prev')!.status).toBe('deprecated')
  })

  it('publishes a ScriptPromoted event after the transaction commits', async () => {
    const repo = new InMemoryBankScriptRepository()
    const candidate = BankScript.create('next', { ...baseProps, status: 'review' })
    repo.store.set(candidate.id, candidate)
    const bus = new InMemoryEventBus()
    const handler = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('ScriptPromoted', handler)

    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), bus)
    await useCase.execute({ scriptId: 'next' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('throws NotFoundError when the script does not exist', async () => {
    const repo = new InMemoryBankScriptRepository()
    const useCase = new PromoteScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await expect(useCase.execute({ scriptId: 'missing' })).rejects.toBeInstanceOf(NotFoundError)
  })
})
