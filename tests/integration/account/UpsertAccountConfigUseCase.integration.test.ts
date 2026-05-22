import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { UpsertAccountConfigUseCase } from '../../../src/contexts/account/application/UpsertAccountConfigUseCase.js'
import type { UpsertAccountConfigInput } from '../../../src/contexts/account/application/dto/AccountConfigDto.js'
import { AccountRepository } from '../../../src/contexts/account/infrastructure/AccountRepository.js'
import { AccountConfigRepository } from '../../../src/contexts/account/infrastructure/AccountConfigRepository.js'
import { BankCredentialsRepository } from '../../../src/contexts/account/infrastructure/BankCredentialsRepository.js'
import { executorFromPool } from '../../../src/contexts/account/infrastructure/Executor.js'
import { UserOperationModeReaderAdapter } from '../../../src/contexts/account/infrastructure/adapters/UserOperationModeReaderAdapter.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { executorFromPool as userExecutorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors/index.js'

function makeUseCase() {
  const exec = executorFromPool(getTestPool())
  const userExec = userExecutorFromPool(getTestPool())
  return new UpsertAccountConfigUseCase(
    new AccountRepository(exec),
    new AccountConfigRepository(exec),
    new BankCredentialsRepository(exec),
    new UserOperationModeReaderAdapter(new UserRepository(userExec)),
  )
}

function baseInput(accountId: string, userId: string, overrides: Partial<UpsertAccountConfigInput> = {}): UpsertAccountConfigInput {
  return {
    userId,
    accountId,
    pendingOrdersEndpoint: 'https://example.com/orders',
    webhookUrl: 'https://hook.example.com',
    retryLimit: 3,
    pollingMethod: 'GET',
    pollingBody: null,
    authType: 'bearer',
    authToken: 'tok',
    webhookAuthType: null,
    webhookAuthToken: null,
    notifyOnExpired: false,
    webhookExtraFields: null,
    silentIngestion: false,
    sessionType: 'one-shot',
    loginMode: 'simple',
    bankUsername: null,
    bankPassword: null,
    ...overrides,
  }
}

describe('UpsertAccountConfigUseCase (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('persists the config and credentials, returns bankUsername (happy path, reconcile mode)', async () => {
    const user = await seedUser({ operationMode: 'reconcile' })
    const acc = await seedAccount(user.id)
    const useCase = makeUseCase()

    const result = await useCase.execute(baseInput(acc.id, user.id, {
      bankUsername: 'alice',
      bankPassword: 'secret',
    }))

    expect(result.accountId).toBe(acc.id)
    expect(result.webhookUrl).toBe('https://hook.example.com')
    expect(result.bankUsername).toBe('alice')

    const { rows: configs } = await getTestPool().query(
      `SELECT account_id, webhook_url FROM account_config WHERE account_id=$1`, [acc.id]
    )
    expect(configs).toHaveLength(1)
    expect(configs[0].webhook_url).toBe('https://hook.example.com')

    const { rows: creds } = await getTestPool().query(
      `SELECT username, status FROM bank_credentials WHERE account_id=$1`, [acc.id]
    )
    expect(creds).toHaveLength(1)
    expect(creds[0].username).toBe('alice')
    expect(creds[0].status).toBe('valid')
  })

  it('passthrough mode allows null pendingOrdersEndpoint', async () => {
    const user = await seedUser({ operationMode: 'passthrough' })
    const acc = await seedAccount(user.id)
    const useCase = makeUseCase()

    const result = await useCase.execute(baseInput(acc.id, user.id, {
      pendingOrdersEndpoint: null,
    }))
    expect(result.pendingOrdersEndpoint).toBeNull()
  })

  it('throws ValidationError when mode=reconcile and pendingOrdersEndpoint is null', async () => {
    const user = await seedUser({ operationMode: 'reconcile' })
    const acc = await seedAccount(user.id)
    const useCase = makeUseCase()

    await expect(
      useCase.execute(baseInput(acc.id, user.id, { pendingOrdersEndpoint: null }))
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when mode=reconcile and pendingOrdersEndpoint is blank', async () => {
    const user = await seedUser({ operationMode: 'reconcile' })
    const acc = await seedAccount(user.id)
    const useCase = makeUseCase()

    await expect(
      useCase.execute(baseInput(acc.id, user.id, { pendingOrdersEndpoint: '   ' }))
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when webhookUrl is missing', async () => {
    const user = await seedUser({ operationMode: 'passthrough' })
    const acc = await seedAccount(user.id)
    const useCase = makeUseCase()

    await expect(
      useCase.execute(baseInput(acc.id, user.id, { webhookUrl: '' }))
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws NotFoundError when account belongs to another user', async () => {
    const owner = await seedUser({ email: 'owner@test.com', operationMode: 'passthrough' })
    const stranger = await seedUser({ email: 'stranger@test.com', operationMode: 'passthrough' })
    const acc = await seedAccount(owner.id)
    const useCase = makeUseCase()

    await expect(
      useCase.execute(baseInput(acc.id, stranger.id))
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('does NOT upsert credentials when bankPassword is missing', async () => {
    const user = await seedUser({ operationMode: 'passthrough' })
    const acc = await seedAccount(user.id)
    const useCase = makeUseCase()

    const result = await useCase.execute(baseInput(acc.id, user.id, {
      bankUsername: 'alice',
      bankPassword: null,
    }))
    expect(result.bankUsername).toBeNull()

    const { rows } = await getTestPool().query(
      `SELECT COUNT(*)::int AS n FROM bank_credentials WHERE account_id=$1`, [acc.id]
    )
    expect(rows[0].n).toBe(0)
  })

  it('is idempotent: two consecutive upserts leave a single config and single credentials row', async () => {
    const user = await seedUser({ operationMode: 'passthrough' })
    const acc = await seedAccount(user.id)
    const useCase = makeUseCase()

    const first = await useCase.execute(baseInput(acc.id, user.id, {
      pendingOrdersEndpoint: null,
      retryLimit: 3,
      bankUsername: 'alice',
      bankPassword: 'secret',
    }))

    const second = await useCase.execute(baseInput(acc.id, user.id, {
      pendingOrdersEndpoint: null,
      retryLimit: 7,
      webhookUrl: 'https://hook.example.com/v2',
      bankUsername: 'alice-v2',
      bankPassword: 'secret-v2',
    }))

    expect(second.id).toBe(first.id)
    expect(second.retryLimit).toBe(7)
    expect(second.webhookUrl).toBe('https://hook.example.com/v2')
    expect(second.bankUsername).toBe('alice-v2')

    const { rows: configs } = await getTestPool().query(
      `SELECT COUNT(*)::int AS n FROM account_config WHERE account_id=$1`, [acc.id]
    )
    expect(configs[0].n).toBe(1)

    const { rows: creds } = await getTestPool().query(
      `SELECT COUNT(*)::int AS n FROM bank_credentials WHERE account_id=$1`, [acc.id]
    )
    expect(creds[0].n).toBe(1)
  })
})
