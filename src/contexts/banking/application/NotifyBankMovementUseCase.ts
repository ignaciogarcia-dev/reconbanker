import { sendWebhook } from '../../../shared/infrastructure/webhooks/WebhookSender.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { INotificationConfigReader } from '../domain/ports/INotificationConfigReader.js'
import { IUserOperationModeReader } from '../domain/ports/IUserOperationModeReader.js'

interface JobData { bankTransactionId: string }

export interface NotifyBankMovementDeps {
  bankTxRepo: IBankTransactionRepository
  accountReader: IAccountForBankingReader
  configReader: INotificationConfigReader
  userModeReader: IUserOperationModeReader
  sendWebhookFn?: typeof sendWebhook
}

export class NotifyBankMovementUseCase {
  constructor(private readonly deps: NotifyBankMovementDeps) {}

  async execute({ bankTransactionId }: JobData): Promise<void> {
    const { bankTxRepo, accountReader, configReader, userModeReader } = this.deps
    const send = this.deps.sendWebhookFn ?? sendWebhook

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
      name:        tx.senderName ?? null,
      received_at: tx.receivedAt instanceof Date ? tx.receivedAt.toISOString() : tx.receivedAt,
    }

    const extra = config.webhookExtraFields
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
        if (!(k in payload)) payload[k] = v
      }
    }

    try {
      await send({ url: config.webhookUrl, payload, authType, authToken: token })
    } catch (err) {
      await bankTxRepo.releaseNotification(bankTransactionId)
      throw err
    }
  }
}
