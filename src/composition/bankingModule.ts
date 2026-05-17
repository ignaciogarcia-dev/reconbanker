import type pg from 'pg'
import type { ILogger } from '../shared/logger/ILogger.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import { executorFromPool } from '../contexts/banking/infrastructure/Executor.js'
import { BankTransactionRepository } from '../contexts/banking/infrastructure/BankTransactionRepository.js'
import { ScrapeRunRepository } from '../contexts/banking/infrastructure/ScrapeRunRepository.js'
import { BankMovementReadModel } from '../contexts/banking/infrastructure/BankMovementReadModel.js'
import { ScriptEngineAdapter } from '../contexts/banking/infrastructure/ScriptEngineAdapter.js'
import { AccountForBankingReaderAdapter } from '../contexts/banking/infrastructure/adapters/AccountForBankingReaderAdapter.js'
import { NotificationConfigReaderAdapter } from '../contexts/banking/infrastructure/adapters/NotificationConfigReaderAdapter.js'
import { UserOperationModeReaderAdapter } from '../contexts/banking/infrastructure/adapters/UserOperationModeReaderAdapter.js'
import { AccountRepository } from '../contexts/account/infrastructure/AccountRepository.js'
import { AccountConfigRepository } from '../contexts/account/infrastructure/AccountConfigRepository.js'
import { UserRepository } from '../contexts/user/infrastructure/UserRepository.js'
import { RunBankScrapeUseCase } from '../contexts/banking/application/RunBankScrapeUseCase.js'
import { NotifyBankMovementUseCase } from '../contexts/banking/application/NotifyBankMovementUseCase.js'
import { ListBankMovementsUseCase } from '../contexts/banking/application/ListBankMovementsUseCase.js'
import { ReNotifyBankMovementUseCase } from '../contexts/banking/application/ReNotifyBankMovementUseCase.js'
import { Queues } from '../shared/infrastructure/queues/QueueRegistry.js'

interface ContainerBase {
  pool: pg.Pool
  logger: ILogger
  eventBus: IEventBus
}

export interface BankingModule {
  runBankScrape: RunBankScrapeUseCase
  notifyBankMovement: NotifyBankMovementUseCase
  listBankMovements: ListBankMovementsUseCase
  reNotifyBankMovement: ReNotifyBankMovementUseCase
  bankTransactionRepository: BankTransactionRepository
}

export function buildBankingModule(container: ContainerBase): BankingModule {
  const exec = executorFromPool(container.pool)

  const bankTxRepo = new BankTransactionRepository(exec)
  const scrapeRunRepo = new ScrapeRunRepository(exec)
  const readModel = new BankMovementReadModel(container.pool)

  const accountRepo = new AccountRepository()
  const configRepo = new AccountConfigRepository()
  const userRepo = new UserRepository()

  const accountReader = new AccountForBankingReaderAdapter(accountRepo)
  const configReader = new NotificationConfigReaderAdapter(configRepo)
  const userModeReader = new UserOperationModeReaderAdapter(userRepo)
  const scriptEngine = new ScriptEngineAdapter()

  const enqueueNotify = async (bankTransactionId: string) => {
    await Queues.bankMovementWebhook.add(
      'notify',
      { bankTransactionId },
      { jobId: `bank-movement-webhook_${bankTransactionId}`, removeOnComplete: true }
    )
  }

  return {
    runBankScrape: new RunBankScrapeUseCase({
      accountReader, txRepo: bankTxRepo, scrapeRunRepo, scriptEngine,
      eventBus: container.eventBus,
    }),
    notifyBankMovement: new NotifyBankMovementUseCase({
      bankTxRepo, accountReader, configReader, userModeReader,
    }),
    listBankMovements: new ListBankMovementsUseCase(readModel),
    reNotifyBankMovement: new ReNotifyBankMovementUseCase({
      bankTxRepo, enqueueNotify,
    }),
    bankTransactionRepository: bankTxRepo,
  }
}
