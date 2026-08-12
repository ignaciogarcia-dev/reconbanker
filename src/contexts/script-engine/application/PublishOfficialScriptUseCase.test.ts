import { describe, it, expect, vi, beforeEach } from 'vitest'

const scriptFileExistsMock = vi.fn()
vi.mock('../infrastructure/ScriptLoader.js', () => ({
  ScriptLoader: { scriptFileExists: (...args: unknown[]) => scriptFileExistsMock(...args) },
}))

import { PublishOfficialScriptUseCase } from './PublishOfficialScriptUseCase.js'
import { InMemoryBankScriptRepository } from '../../../../tests/helpers/inMemoryScriptRepo.js'
import { InMemoryUnitOfWork } from '../../../../tests/helpers/inMemoryUnitOfWork.js'
import { InMemoryEventBus } from '../../../shared/events/InMemoryEventBus.js'
import { BankScript } from '../domain/BankScript.js'

describe('PublishOfficialScriptUseCase', () => {
  beforeEach(() => {
    scriptFileExistsMock.mockReset()
  })

  it('creates and activates a new official script, deprecating the previous official one', async () => {
    scriptFileExistsMock.mockReturnValue(true)
    const repo = new InMemoryBankScriptRepository()
    const previous = BankScript.create('prev', {
      bank: 'mi-dinero', flowType: 'extract_transactions', version: '1.0.0',
      origin: 'system', status: 'active', selectorMap: {},
    })
    repo.store.set(previous.id, previous)

    const useCase = new PublishOfficialScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await useCase.execute({ bank: 'mi-dinero', flowType: 'extract_transactions', version: '1.1.0' })

    const scripts = [...repo.store.values()]
    const activated = scripts.find((s) => s.version === '1.1.0')
    expect(activated).toBeDefined()
    expect(activated!.status).toBe('active')
    expect(activated!.origin).toBe('system')
    expect(activated!.userId).toBeUndefined()
    expect(repo.store.get('prev')!.status).toBe('deprecated')
  })

  it('never touches private (user/account-owned) scripts for the same bank/flow', async () => {
    scriptFileExistsMock.mockReturnValue(true)
    const repo = new InMemoryBankScriptRepository()
    const privateScript = BankScript.create('priv', {
      bank: 'mi-dinero', flowType: 'extract_transactions', version: '1.0.0',
      origin: 'user', status: 'active', selectorMap: {}, userId: 'user-1',
    })
    repo.store.set(privateScript.id, privateScript)

    const useCase = new PublishOfficialScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())
    await useCase.execute({ bank: 'mi-dinero', flowType: 'extract_transactions', version: '1.1.0' })

    expect(repo.store.get('priv')!.status).toBe('active')
  })

  it('throws when the on-disk script file does not exist', async () => {
    scriptFileExistsMock.mockReturnValue(false)
    const repo = new InMemoryBankScriptRepository()
    const useCase = new PublishOfficialScriptUseCase(repo as any, new InMemoryUnitOfWork(), new InMemoryEventBus())

    await expect(
      useCase.execute({ bank: 'ghost-bank', flowType: 'extract_transactions', version: '1.0.0' }),
    ).rejects.toThrow(/not found/i)
    expect(repo.store.size).toBe(0)
  })

  it('publishes a ScriptPromoted event', async () => {
    scriptFileExistsMock.mockReturnValue(true)
    const repo = new InMemoryBankScriptRepository()
    const bus = new InMemoryEventBus()
    const handler = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('ScriptPromoted', handler)

    const useCase = new PublishOfficialScriptUseCase(repo as any, new InMemoryUnitOfWork(), bus)
    await useCase.execute({ bank: 'mi-dinero', flowType: 'extract_transactions', version: '1.1.0' })

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
