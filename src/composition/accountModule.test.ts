import { describe, it, expect } from 'vitest'
import { buildAccountModule } from './accountModule.js'
import { buildUserModule } from './userModule.js'
import { CreateAccountUseCase } from '../contexts/account/application/CreateAccountUseCase.js'
import { DeleteAccountUseCase } from '../contexts/account/application/DeleteAccountUseCase.js'
import { ListAccountsForUserUseCase } from '../contexts/account/application/ListAccountsForUserUseCase.js'
import { GetAccountDetailUseCase } from '../contexts/account/application/GetAccountDetailUseCase.js'
import { GetAccountConfigUseCase } from '../contexts/account/application/GetAccountConfigUseCase.js'
import { UpsertAccountConfigUseCase } from '../contexts/account/application/UpsertAccountConfigUseCase.js'
import { ListBanksUseCase } from '../contexts/account/application/ListBanksUseCase.js'
import { CreateBankUseCase } from '../contexts/account/application/CreateBankUseCase.js'
import { GetBankDetailUseCase } from '../contexts/account/application/GetBankDetailUseCase.js'

function makeContainer() {
  const logger: any = { debug() {}, info() {}, warn() {}, error() {}, child() { return logger } }
  return {
    pool: { query: () => Promise.resolve({ rows: [] }) } as any,
    logger,
    eventBus: { publish: () => Promise.resolve(), subscribe: () => {} } as any,
    unitOfWork: { run: async (fn: any) => fn({}) } as any,
  }
}

describe('buildAccountModule', () => {
  it('wires every account use case', () => {
    process.env.JWT_SECRET = 'test-secret'
    const base = makeContainer()
    const user = buildUserModule(base)
    const mod = buildAccountModule({ ...base, user })

    expect(mod.createAccount).toBeInstanceOf(CreateAccountUseCase)
    expect(mod.deleteAccount).toBeInstanceOf(DeleteAccountUseCase)
    expect(mod.listAccountsForUser).toBeInstanceOf(ListAccountsForUserUseCase)
    expect(mod.getAccountDetail).toBeInstanceOf(GetAccountDetailUseCase)
    expect(mod.getAccountConfig).toBeInstanceOf(GetAccountConfigUseCase)
    expect(mod.upsertAccountConfig).toBeInstanceOf(UpsertAccountConfigUseCase)
    expect(mod.listBanks).toBeInstanceOf(ListBanksUseCase)
    expect(mod.createBank).toBeInstanceOf(CreateBankUseCase)
    expect(mod.getBankDetail).toBeInstanceOf(GetBankDetailUseCase)
    expect(mod.accountRepository).toBeDefined()
    expect(mod.accountConfigRepository).toBeDefined()
    expect(mod.bankRepository).toBeDefined()
    expect(mod.bankCredentialsRepository).toBeDefined()
  })
})
