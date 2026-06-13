import type pg from 'pg'
import type { ILogger } from '../shared/logger/ILogger.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import type { IUnitOfWork } from '../shared/persistence/IUnitOfWork.js'
import type { IWebhookNotificationLog } from '../shared/infrastructure/webhooks/IWebhookNotificationLog.js'
import type { BankingModule } from './bankingModule.js'
import type { AccountModule } from './accountModule.js'
import type { UserModule } from './userModule.js'

// Avoid circular import: depend only on the bits of Container we actually use.
interface ContainerBase {
  pool: pg.Pool
  logger: ILogger
  eventBus: IEventBus
  unitOfWork: IUnitOfWork
  webhookLog: IWebhookNotificationLog
  banking: BankingModule
  account: AccountModule
  user: UserModule
}
import { ConciliationEngine } from '../contexts/conciliation/domain/ConciliationEngine.js'
import { ConciliationRequestRepository } from '../contexts/conciliation/infrastructure/ConciliationRequestRepository.js'
import { ConciliatedTransactionRepository } from '../contexts/conciliation/infrastructure/ConciliatedTransactionRepository.js'
import { ConciliationAttemptRepository } from '../contexts/conciliation/infrastructure/ConciliationAttemptRepository.js'
import { ConciliationReadModel } from '../contexts/conciliation/infrastructure/ConciliationReadModel.js'
import { executorFromPool } from '../contexts/conciliation/infrastructure/Executor.js'
import { BankTransactionFinderAdapter } from '../contexts/conciliation/infrastructure/adapters/BankTransactionFinderAdapter.js'
import { AccountConfigReaderAdapter } from '../contexts/conciliation/infrastructure/adapters/AccountConfigReaderAdapter.js'
import { AccountReaderAdapter } from '../contexts/conciliation/infrastructure/adapters/AccountReaderAdapter.js'
import { UserOperationModeReaderAdapter } from '../contexts/conciliation/infrastructure/adapters/UserOperationModeReaderAdapter.js'
import { ConciliationOwnershipCheckerAdapter } from '../contexts/conciliation/infrastructure/adapters/ConciliationOwnershipCheckerAdapter.js'
import { HttpOrderSource } from '../contexts/conciliation/infrastructure/adapters/HttpOrderSource.js'
import { RunConciliationUseCase } from '../contexts/conciliation/application/RunConciliationUseCase.js'
import { ProcessIncomingTransactionUseCase } from '../contexts/conciliation/application/ProcessIncomingTransactionUseCase.js'
import { PollPendingOrdersUseCase } from '../contexts/conciliation/application/PollPendingOrdersUseCase.js'
import { NotifyWebhookUseCase } from '../contexts/conciliation/application/NotifyWebhookUseCase.js'
import { ExpireStaleRequestsUseCase } from '../contexts/conciliation/application/ExpireStaleRequestsUseCase.js'
import { OnTransactionIngestedUseCase } from '../contexts/conciliation/application/OnTransactionIngestedUseCase.js'
import { ListConciliationRequestsUseCase } from '../contexts/conciliation/application/ListConciliationRequestsUseCase.js'
import { GetConciliationRequestDetailUseCase } from '../contexts/conciliation/application/GetConciliationRequestDetailUseCase.js'
import { Queues } from '../shared/infrastructure/queues/QueueRegistry.js'

export interface ConciliationModule {
  runConciliation: RunConciliationUseCase
  processIncomingTransaction: ProcessIncomingTransactionUseCase
  pollPendingOrders: PollPendingOrdersUseCase
  notifyWebhook: NotifyWebhookUseCase
  expireStaleRequests: ExpireStaleRequestsUseCase
  onTransactionIngested: OnTransactionIngestedUseCase
  listConciliationRequests: ListConciliationRequestsUseCase
  getConciliationRequestDetail: GetConciliationRequestDetailUseCase
  ownershipChecker: ConciliationOwnershipCheckerAdapter
  requestRepository: ConciliationRequestRepository
}

export function buildConciliationModule(container: ContainerBase): ConciliationModule {
  const exec = executorFromPool(container.pool)

  const requestRepo = new ConciliationRequestRepository(exec)
  const matchRepo = new ConciliatedTransactionRepository(exec)
  const attemptRepo = new ConciliationAttemptRepository(exec)
  const readModel = new ConciliationReadModel(container.pool)

  const bankTxRepo = container.banking.bankTransactionRepository
  const accountRepo = container.account.accountRepository
  const userRepo = container.user.userRepository

  const bankTransactionFinder = new BankTransactionFinderAdapter(exec, bankTxRepo)
  const configReader = new AccountConfigReaderAdapter(container.pool)
  const accountReader = new AccountReaderAdapter(accountRepo)
  const userModeReader = new UserOperationModeReaderAdapter(userRepo)
  const ownershipChecker = new ConciliationOwnershipCheckerAdapter(container.pool)
  const orderSource = new HttpOrderSource(container.logger.child('[http-order-source]'))

  const engine = new ConciliationEngine()
  const logger = container.logger.child('[conciliation]')

  const enqueueRun = async (requestId: string) => {
    await Queues.conciliation.add(
      'run',
      { requestId },
      { jobId: `conciliation_${requestId}`, removeOnComplete: true }
    )
  }
  const enqueueWebhook = async (requestId: string) => {
    await Queues.webhook.add(
      'notify',
      { requestId },
      { jobId: `webhook_expired_${requestId}`, removeOnComplete: true }
    )
  }
  const enqueueProcess = async (transactionId: string) => {
    await Queues.txConciliation.add(
      'process',
      { transactionId },
      { jobId: `tx_conciliation_${transactionId}`, removeOnComplete: true }
    )
  }

  return {
    runConciliation: new RunConciliationUseCase({
      unitOfWork: container.unitOfWork,
      eventBus: container.eventBus,
      requestRepo, attemptRepo, matchRepo,
      bankTransactionFinder, engine,
    }),
    processIncomingTransaction: new ProcessIncomingTransactionUseCase({
      unitOfWork: container.unitOfWork,
      eventBus: container.eventBus,
      requestRepo, attemptRepo, matchRepo,
      bankTransactionFinder, engine,
    }),
    pollPendingOrders: new PollPendingOrdersUseCase({
      requestRepo, configReader, accountReader, userModeReader, orderSource,
      enqueueRun, logger,
    }),
    notifyWebhook: new NotifyWebhookUseCase({
      requestRepo, matchRepo, configReader,
      webhookLog: container.webhookLog,
    }),
    expireStaleRequests: new ExpireStaleRequestsUseCase({
      requestRepo, configReader, eventBus: container.eventBus,
      enqueueWebhook, logger,
    }),
    onTransactionIngested: new OnTransactionIngestedUseCase({
      requestRepo, bankTransactionFinder, enqueueProcess, logger,
    }),
    listConciliationRequests: new ListConciliationRequestsUseCase(readModel),
    getConciliationRequestDetail: new GetConciliationRequestDetailUseCase(readModel),
    ownershipChecker,
    requestRepository: requestRepo,
  }
}
