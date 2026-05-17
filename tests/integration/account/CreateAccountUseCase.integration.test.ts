import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, getMiDineroBank } from '../helpers/seed.js'
import { CreateAccountUseCase } from '../../../src/contexts/account/application/CreateAccountUseCase.js'
import { AccountRepository } from '../../../src/contexts/account/infrastructure/AccountRepository.js'
import { BankRepository } from '../../../src/contexts/account/infrastructure/BankRepository.js'
import { executorFromPool } from '../../../src/contexts/account/infrastructure/Executor.js'
import { NotFoundError } from '../../../src/shared/errors/index.js'

describe('CreateAccountUseCase (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function makeUseCase() {
    const exec = executorFromPool(getTestPool())
    return new CreateAccountUseCase(new AccountRepository(exec), new BankRepository(exec))
  }

  it('creates and persists the account when bankId is valid (happy path)', async () => {
    const user = await seedUser()
    const bank = await getMiDineroBank()
    const useCase = makeUseCase()

    const { id } = await useCase.execute({ userId: user.id, bankId: bank.id, name: 'My Account' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)

    const { rows } = await getTestPool().query(
      'SELECT user_id, bank_id, name, status FROM accounts WHERE id=$1', [id]
    )
    expect(rows[0]).toMatchObject({
      user_id: user.id,
      bank_id: bank.id,
      name: 'My Account',
      status: 'active',
    })
  })

  it('throws NotFoundError when bankId does not exist', async () => {
    const user = await seedUser()
    const useCase = makeUseCase()

    await expect(
      useCase.execute({ userId: user.id, bankId: crypto.randomUUID(), name: 'X' })
    ).rejects.toBeInstanceOf(NotFoundError)

    const { rows } = await getTestPool().query('SELECT COUNT(*)::int AS n FROM accounts')
    expect(rows[0].n).toBe(0)
  })
})
