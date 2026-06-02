import type pg from 'pg'
import type { ILogger } from '../shared/logger/ILogger.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import { credentialsCipher } from '../shared/infrastructure/crypto/CredentialsCipher.js'
import type { IWebhookNotificationLog } from '../shared/infrastructure/webhooks/IWebhookNotificationLog.js'
import type { IWebhookDeadLetterStore } from '../shared/infrastructure/webhooks/IWebhookDeadLetterStore.js'
import { executorFromPool } from '../contexts/banking/infrastructure/Executor.js'
import { BankTransactionRepository } from '../contexts/banking/infrastructure/BankTransactionRepository.js'
import { ScrapeRunRepository } from '../contexts/banking/infrastructure/ScrapeRunRepository.js'
import { BankMovementReadModel } from '../contexts/banking/infrastructure/BankMovementReadModel.js'
import { ScriptEngineAdapter } from '../contexts/banking/infrastructure/ScriptEngineAdapter.js'
import { AccountForBankingReaderAdapter } from '../contexts/banking/infrastructure/adapters/AccountForBankingReaderAdapter.js'
import { AccountScrapeBlockerAdapter } from '../contexts/banking/infrastructure/adapters/AccountScrapeBlockerAdapter.js'
import { NotificationConfigReaderAdapter } from '../contexts/banking/infrastructure/adapters/NotificationConfigReaderAdapter.js'
import { UserOperationModeReaderAdapter } from '../contexts/banking/infrastructure/adapters/UserOperationModeReaderAdapter.js'
import type { AccountModule } from './accountModule.js'
import type { UserModule } from './userModule.js'
import { RunBankScrapeUseCase } from '../contexts/banking/application/RunBankScrapeUseCase.js'
import { IngestTransactionsUseCase } from '../contexts/banking/application/IngestTransactionsUseCase.js'
import { BankSessionRepository } from '../contexts/banking/infrastructure/BankSessionRepository.js'
import { SessionManager } from '../contexts/banking/infrastructure/SessionManager.js'
import { PersistentPlaywrightRunner } from '../contexts/script-engine/infrastructure/PersistentPlaywrightRunner.js'
import { ScriptLoader } from '../contexts/script-engine/infrastructure/ScriptLoader.js'
import { db } from '../shared/infrastructure/db/client.js'
import { NotifyBankMovementUseCase } from '../contexts/banking/application/NotifyBankMovementUseCase.js'
import { ListBankMovementsUseCase } from '../contexts/banking/application/ListBankMovementsUseCase.js'
import { ReNotifyBankMovementUseCase } from '../contexts/banking/application/ReNotifyBankMovementUseCase.js'
import { ListWebhookDeadLettersUseCase } from '../contexts/banking/application/ListWebhookDeadLettersUseCase.js'
import { Queues } from '../shared/infrastructure/queues/QueueRegistry.js'

interface ContainerBase {
  pool: pg.Pool
  logger: ILogger
  eventBus: IEventBus
  webhookLog: IWebhookNotificationLog
  webhookDeadLetters: IWebhookDeadLetterStore
  account: AccountModule
  user: UserModule
}

export interface BankingModule {
  runBankScrape: RunBankScrapeUseCase
  notifyBankMovement: NotifyBankMovementUseCase
  listBankMovements: ListBankMovementsUseCase
  reNotifyBankMovement: ReNotifyBankMovementUseCase
  listWebhookDeadLetters: ListWebhookDeadLettersUseCase
  bankTransactionRepository: BankTransactionRepository
  sessionManager: SessionManager
}

export function buildBankingModule(container: ContainerBase): BankingModule {
  const exec = executorFromPool(container.pool)

  const bankTxRepo = new BankTransactionRepository(exec)
  const scrapeRunRepo = new ScrapeRunRepository(exec)
  const readModel = new BankMovementReadModel(container.pool)

  const accountRepo = container.account.accountRepository
  const configRepo = container.account.accountConfigRepository
  const userRepo = container.user.userRepository

  const accountReader = new AccountForBankingReaderAdapter(accountRepo, configRepo)
  const scrapeBlocker = new AccountScrapeBlockerAdapter(exec)
  const configReader = new NotificationConfigReaderAdapter(configRepo)
  const userModeReader = new UserOperationModeReaderAdapter(userRepo)
  const scriptEngine = new ScriptEngineAdapter()

  const ingest = new IngestTransactionsUseCase({ txRepo: bankTxRepo, eventBus: container.eventBus })

  const bankSessionRepo = new BankSessionRepository(exec)
  const persistentRunner = new PersistentPlaywrightRunner()

  const startFn = async (accountId: string) => {
    const account = await accountReader.findById(accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)

    const { rows: [creds] } = await db.query(
      `SELECT username, encrypted_password FROM bank_credentials
       WHERE account_id = $1 AND status = 'valid'`,
      [accountId]
    )
    if (!creds) throw new Error(`No valid credentials for account ${accountId}`)

    const script = await ScriptLoader.loadActive(account.bank, 'extract_transactions')
    if (!script || !script.codeSnapshot) throw new Error(`No active script for ${account.bank}`)

    const lastExternalId = await bankTxRepo.findLatestExternalId(accountId)

    return persistentRunner.start({
      scriptCode: script.codeSnapshot,
      loginMode: account.loginMode,
      pollIntervalMs: Number(process.env.PERSISTENT_POLL_INTERVAL_MS ?? 60_000),
      context: { accountId, username: creds.username, password: credentialsCipher().decrypt(creds.encrypted_password), lastExternalId },
      onTransactions: async (batch) => { await ingest.execute(accountId, script.id, batch) },
      shouldStop: () => false,
      // Bank-local day key; a change clears runMonitor's dedup set so it stays bounded
      // over multi-day sessions. Ecuador for Pichincha — make this bank-specific when
      // more persistent banks are added.
      getBankDay: () =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date()),
    })
  }

  const sessionManager = new SessionManager(startFn, bankSessionRepo, scrapeBlocker)

  const enqueueNotify = async (bankTransactionId: string) => {
    const jobId = `bank-movement-webhook_${bankTransactionId}`
    // A prior failed delivery is retained in the queue (removeOnFail: false), and
    // BullMQ treats a re-add with an existing jobId as a no-op. Drop the stale job
    // first so a re-drive genuinely re-enqueues instead of silently doing nothing.
    await Queues.bankMovementWebhook.remove(jobId)
    await Queues.bankMovementWebhook.add(
      'notify',
      { bankTransactionId },
      { jobId, removeOnComplete: true }
    )
  }

  return {
    runBankScrape: new RunBankScrapeUseCase({
      accountReader, txRepo: bankTxRepo, scrapeRunRepo, scriptEngine,
      eventBus: container.eventBus, ingest, blocker: scrapeBlocker,
      ensureSession: (accountId) => sessionManager.ensureRunning(accountId),
    }),
    notifyBankMovement: new NotifyBankMovementUseCase({
      bankTxRepo, accountReader, configReader, userModeReader,
      webhookLog: container.webhookLog,
    }),
    listBankMovements: new ListBankMovementsUseCase(readModel),
    reNotifyBankMovement: new ReNotifyBankMovementUseCase({
      bankTxRepo, enqueueNotify,
    }),
    listWebhookDeadLetters: new ListWebhookDeadLettersUseCase({
      deadLetters: container.webhookDeadLetters,
    }),
    bankTransactionRepository: bankTxRepo,
    sessionManager,
  }
}
