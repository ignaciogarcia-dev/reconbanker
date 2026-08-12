import { describe, it, expect } from 'vitest'
import { DeprecateScriptUseCase } from './DeprecateScriptUseCase.js'
import { BankScript } from '../domain/BankScript.js'
import { InMemoryBankScriptRepository } from '../../../../tests/helpers/inMemoryScriptRepo.js'
import { ForbiddenError, NotFoundError } from '../../../shared/errors/index.js'

const OWNER = 'user-1'
const OTHER = 'user-2'

const baseProps = {
  bank: 'TEST',
  flowType: 'extract_transactions' as const,
  version: '1.0.0',
  origin: 'user' as const,
  status: 'active' as const,
  selectorMap: {},
}

describe('DeprecateScriptUseCase', () => {
  it('deprecates the caller\'s own active script', async () => {
    const repo = new InMemoryBankScriptRepository()
    const script = BankScript.create('s-1', { ...baseProps, userId: OWNER })
    repo.store.set(script.id, script)

    const useCase = new DeprecateScriptUseCase(repo)
    await useCase.execute({ scriptId: 's-1', callerId: OWNER })

    expect(repo.store.get('s-1')!.status).toBe('deprecated')
  })

  it('throws NotFoundError when the script does not exist', async () => {
    const repo = new InMemoryBankScriptRepository()
    const useCase = new DeprecateScriptUseCase(repo)
    await expect(useCase.execute({ scriptId: 'missing', callerId: OWNER })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws NotFoundError (masking existence) when the script is privately owned by someone else', async () => {
    const repo = new InMemoryBankScriptRepository()
    const script = BankScript.create('s-1', { ...baseProps, userId: OWNER })
    repo.store.set(script.id, script)

    const useCase = new DeprecateScriptUseCase(repo)
    await expect(useCase.execute({ scriptId: 's-1', callerId: OTHER })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws ForbiddenError when a regular caller tries to deprecate the official system script', async () => {
    const repo = new InMemoryBankScriptRepository()
    const script = BankScript.create('s-1', { ...baseProps, origin: 'system' })
    repo.store.set(script.id, script)

    const useCase = new DeprecateScriptUseCase(repo)
    await expect(useCase.execute({ scriptId: 's-1', callerId: OWNER })).rejects.toBeInstanceOf(ForbiddenError)
  })
})
