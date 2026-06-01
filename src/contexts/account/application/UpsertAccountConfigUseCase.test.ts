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
  // Literal public IPs so the SSRF guard runs without needing DNS in tests.
  pendingOrdersEndpoint: 'https://93.184.216.34/orders',
  webhookUrl: 'https://93.184.216.34/hook',
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
  sessionType: 'one-shot' as const,
  loginMode: 'simple' as const,
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

  it('rejects a webhook_url pointing at an internal address (SSRF guard)', async () => {
    const { useCase } = buildSut()
    await expect(
      useCase.execute({ ...baseInput, webhookUrl: 'http://169.254.169.254/latest/meta-data' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a pending_orders_endpoint pointing at a private address (SSRF guard)', async () => {
    const { useCase } = buildSut()
    await expect(
      useCase.execute({ ...baseInput, pendingOrdersEndpoint: 'http://10.0.0.5/orders' })
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

  it('preserves the stored secret when the masked sentinel is sent back', async () => {
    const { useCase, configRepo } = buildSut()
    await useCase.execute({ ...baseInput, authToken: 'original-token', webhookAuthToken: 'original-webhook' })

    await useCase.execute({
      ...baseInput,
      authToken: '__secret_present__',
      webhookAuthToken: '__secret_present__',
    })

    const stored = configRepo.store.get('acc-1')!
    expect(stored.authToken).toBe('original-token')
    expect(stored.webhookAuthToken).toBe('original-webhook')
  })

  it('normalizes null/empty authToken and webhookAuthToken to null', async () => {
    const { useCase, configRepo } = buildSut()
    await useCase.execute({
      ...baseInput,
      authToken: null,
      webhookAuthToken: '   ',
    })
    const stored = configRepo.store.get('acc-1')!
    expect(stored.authToken).toBeNull()
    expect(stored.webhookAuthToken).toBeNull()
  })
})
