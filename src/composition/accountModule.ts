import type pg from 'pg'
import type { ILogger } from '../shared/logger/ILogger.js'
import { executorFromPool } from '../contexts/account/infrastructure/Executor.js'
import { AccountRepository } from '../contexts/account/infrastructure/AccountRepository.js'
import { AccountConfigRepository } from '../contexts/account/infrastructure/AccountConfigRepository.js'
import { BankRepository } from '../contexts/account/infrastructure/BankRepository.js'
import { BankCredentialsRepository } from '../contexts/account/infrastructure/BankCredentialsRepository.js'
import { BankScriptListReaderAdapter } from '../contexts/account/infrastructure/adapters/BankScriptListReaderAdapter.js'
import { UserOperationModeReaderAdapter } from '../contexts/account/infrastructure/adapters/UserOperationModeReaderAdapter.js'
import type { UserModule } from './userModule.js'
import { CreateAccountUseCase } from '../contexts/account/application/CreateAccountUseCase.js'
import { DeleteAccountUseCase } from '../contexts/account/application/DeleteAccountUseCase.js'
import { ListAccountsForUserUseCase } from '../contexts/account/application/ListAccountsForUserUseCase.js'
import { GetAccountDetailUseCase } from '../contexts/account/application/GetAccountDetailUseCase.js'
import { GetAccountConfigUseCase } from '../contexts/account/application/GetAccountConfigUseCase.js'
import { UpsertAccountConfigUseCase } from '../contexts/account/application/UpsertAccountConfigUseCase.js'
import { ListBanksUseCase } from '../contexts/account/application/ListBanksUseCase.js'
import { CreateBankUseCase } from '../contexts/account/application/CreateBankUseCase.js'
import { GetBankDetailUseCase } from '../contexts/account/application/GetBankDetailUseCase.js'

interface ContainerBase {
  pool: pg.Pool
  logger: ILogger
  user: UserModule
}

export interface AccountModule {
  createAccount: CreateAccountUseCase
  deleteAccount: DeleteAccountUseCase
  listAccountsForUser: ListAccountsForUserUseCase
  getAccountDetail: GetAccountDetailUseCase
  getAccountConfig: GetAccountConfigUseCase
  upsertAccountConfig: UpsertAccountConfigUseCase
  listBanks: ListBanksUseCase
  createBank: CreateBankUseCase
  getBankDetail: GetBankDetailUseCase
  accountRepository: AccountRepository
  accountConfigRepository: AccountConfigRepository
  bankRepository: BankRepository
  bankCredentialsRepository: BankCredentialsRepository
}

export function buildAccountModule(container: ContainerBase): AccountModule {
  const exec = executorFromPool(container.pool)

  const accountRepository = new AccountRepository(exec)
  const accountConfigRepository = new AccountConfigRepository(exec)
  const bankRepository = new BankRepository(exec)
  const bankCredentialsRepository = new BankCredentialsRepository(exec)

  const scriptReader = new BankScriptListReaderAdapter(container.pool)
  const userModeReader = new UserOperationModeReaderAdapter(container.user.userRepository)

  return {
    accountRepository,
    accountConfigRepository,
    bankRepository,
    bankCredentialsRepository,
    createAccount: new CreateAccountUseCase(accountRepository, bankRepository),
    deleteAccount: new DeleteAccountUseCase(accountRepository),
    listAccountsForUser: new ListAccountsForUserUseCase(accountRepository),
    getAccountDetail: new GetAccountDetailUseCase(accountRepository),
    getAccountConfig: new GetAccountConfigUseCase(
      accountRepository, accountConfigRepository, bankCredentialsRepository
    ),
    upsertAccountConfig: new UpsertAccountConfigUseCase(
      accountRepository, accountConfigRepository, bankCredentialsRepository, userModeReader
    ),
    listBanks: new ListBanksUseCase(bankRepository),
    createBank: new CreateBankUseCase(bankRepository),
    getBankDetail: new GetBankDetailUseCase(bankRepository, scriptReader),
  }
}
