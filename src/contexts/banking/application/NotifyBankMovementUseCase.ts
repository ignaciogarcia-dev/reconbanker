import { sendWebhook } from '../../../shared/infrastructure/webhooks/WebhookSender.js'
import { makeLoggingWebhookSender } from '../../../shared/infrastructure/webhooks/LoggingWebhookSender.js'
import { IWebhookNotificationLog } from '../../../shared/infrastructure/webhooks/IWebhookNotificationLog.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { INotificationConfigReader } from '../domain/ports/INotificationConfigReader.js'
import { IUserOperationModeReader } from '../domain/ports/IUserOperationModeReader.js'

interface JobData { bankTransactionId: string; attempt?: number }

export interface NotifyBankMovementDeps {
  bankTxRepo: IBankTransactionRepository
  accountReader: IAccountForBankingReader
  configReader: INotificationConfigReader
  userModeReader: IUserOperationModeReader
  webhookLog: IWebhookNotificationLog
  sendWebhookFn?: typeof sendWebhook
}

export class NotifyBankMovementUseCase {
  constructor(private readonly deps: NotifyBankMovementDeps) {}

  async execute({ bankTransactionId, attempt = 1 }: JobData): Promise<void> {
    const { bankTxRepo, accountReader, configReader, userModeReader, webhookLog } = this.deps

    const tx = await bankTxRepo.findById(bankTransactionId)
    if (!tx) return

    const config = await configReader.findByAccountId(tx.accountId)
    if (!config) return

    const account = await accountReader.findById(tx.accountId)
    if (!account) return

    const mode = await userModeReader.getOperationMode(account.userId)
    if (mode !== 'passthrough') return
    if (!config.webhookUrl) return
    if (!tx.senderName) return

    const claimed = await bankTxRepo.claimNotification(bankTransactionId)
    if (!claimed) return

    if (config.silentIngestion) return

    const token = config.webhookAuthToken ?? config.authToken
    const authType = config.webhookAuthType ?? config.authType

    const payload: Record<string, unknown> = {
      id:          tx.id,
      amount:      tx.amount,
      currency:    tx.currency,
      // The line-36 guard ensures senderName is non-empty here.
      name:        tx.senderName,
      received_at: tx.receivedAt instanceof Date ? tx.receivedAt.toISOString() : tx.receivedAt,
    }

    const extra = config.webhookExtraFields
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
        if (!(k in payload)) payload[k] = v
      }
    }

    const send = makeLoggingWebhookSender(
      webhookLog,
      { accountId: tx.accountId, subjectType: 'bank_transaction', subjectId: tx.id, attempt },
      this.deps.sendWebhookFn,
    )

    try {
      await send({ url: config.webhookUrl, payload, authType, authToken: token })
    } catch (err) {
      await bankTxRepo.releaseNotification(bankTransactionId)
      throw err
    }
  }
}
