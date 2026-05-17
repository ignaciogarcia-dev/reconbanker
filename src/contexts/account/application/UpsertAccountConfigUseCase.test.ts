import { describe, it, expect } from 'vitest'
import { UpsertAccountConfigUseCase } from './UpsertAccountConfigUseCase.js'
import { Account } from '../domain/Account.js'
import {
  InMemoryAccountRepository,
  InMemoryAccountConfigRepository,
  InMemoryBankCredentialsRepository,
} from '../../../../tests/helpers/inMemoryAccountRepos.js'
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js'

function buildSut(mode: 'reconcile' | 'passthrough' = 'reconcile') {
  const accountRepo = new InMemoryAccountRepository()
  const configRepo = new InMemoryAccountConfigRepository()
  const credentialsRepo = new InMemoryBankCredentialsRepository()
  const account = Account.create('acc-1', 'user-1', 'bank-1', 'TEST', 'My acc')
  account.clearDomainEvents()
  accountRepo.store.set(account.id, account)
  const useCase = new UpsertAccountConfigUseCase(
    accountRepo, configRepo, credentialsRepo,
    { getOperationMode: async () => mode },
  )
  return { useCase, accountRepo, configRepo, credentialsRepo }
}

const baseInput = {
  userId: 'user-1',
  accountId: 'acc-1',
  pendingOrdersEndpoint: 'https://example.com/orders',
  webhookUrl: 'https://hook.example.com',
  retryLimit: 3,
  pollingMethod: 'GET' as const,
  pollingBody: null,
  authType: 'bearer' as const,
  authToken: 'tok',
  webhookAuthType: null,
  webhookAuthToken: null,
  notifyOnExpired: false,
  webhookExtraFields: null,
  silentIngestion: false,
  bankUsername: null,
  bankPassword: null,
}

describe('UpsertAccountConfigUseCase', () => {
  it('throws NotFoundError when account does not belong to user', async () => {
    const { useCase } = buildSut()
    await expect(
      useCase.execute({ ...baseInput, userId: 'other' })
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('rejects when webhook_url is missing', async () => {
    const { useCase } = buildSut()
    await expect(
      useCase.execute({ ...baseInput, webhookUrl: '' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('requires pendingOrdersEndpoint when mode is reconcile', async () => {
    const { useCase } = buildSut('reconcile')
    await expect(
      useCase.execute({ ...baseInput, pendingOrdersEndpoint: null })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('allows null pendingOrdersEndpoint when mode is passthrough', async () => {
    const { useCase, configRepo } = buildSut('passthrough')
    const result = await useCase.execute({ ...baseInput, pendingOrdersEndpoint: null })
    expect(configRepo.store.get('acc-1')?.pendingOrdersEndpoint).toBeNull()
    expect(result.webhookUrl).toBe(baseInput.webhookUrl)
  })

  it('upserts credentials when both username and password are provided', async () => {
    const { useCase, credentialsRepo } = buildSut()
    await useCase.execute({ ...baseInput, bankUsername: 'alice', bankPassword: 'secret' })
    const rec = credentialsRepo.store.get('acc-1')
    expect(rec?.username).toBe('alice')
    expect(rec?.status).toBe('valid')
  })

  it('does not upsert credentials when only username is provided', async () => {
    const { useCase, credentialsRepo } = buildSut()
    await useCase.execute({ ...baseInput, bankUsername: 'alice', bankPassword: null })
    expect(credentialsRepo.store.has('acc-1')).toBe(false)
  })

  it('returns bankUsername in the response after upsert', async () => {
    const { useCase } = buildSut()
    const result = await useCase.execute({ ...baseInput, bankUsername: 'alice', bankPassword: 'secret' })
    expect(result.bankUsername).toBe('alice')
  })
})
