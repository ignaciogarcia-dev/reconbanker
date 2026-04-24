import { sendWebhook } from '../../../shared/infrastructure/webhooks/WebhookSender.js'
import { AccountConfigRepository } from '../../account/infrastructure/AccountConfigRepository.js'
import { BankTransactionRepository } from '../infrastructure/BankTransactionRepository.js'

interface JobData { bankTransactionId: string }

export class NotifyBankMovementUseCase {
  private readonly bankTxRepo = new BankTransactionRepository()
  private readonly configRepo = new AccountConfigRepository()

  async execute({ bankTransactionId }: JobData): Promise<void> {
    const tx = await this.bankTxRepo.findById(bankTransactionId)
    if (!tx) return

    const config = await this.configRepo.findByAccountId(tx.accountId)
    if (!config) return
    if (config.mode !== 'passthrough') return
    if (!config.webhookUrl) return

    // Claim atómico antes de enviar: si otra ejecución ya lo notificó, salimos.
    // Si el envío falla, liberamos el claim para que BullMQ pueda reintentar.
    const claimed = await this.bankTxRepo.claimNotification(bankTransactionId)
    if (!claimed) return

    const token = config.webhookAuthToken ?? config.authToken
    const authType = config.webhookAuthType ?? config.authType

    const payload: Record<string, unknown> = {
      id:          tx.id,
      amount:      tx.amount,
      currency:    tx.currency,
      sender_name: tx.senderName ?? null,
      received_at: tx.receivedAt instanceof Date ? tx.receivedAt.toISOString() : tx.receivedAt,
    }

    const extra = config.webhookExtraFields
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      for (const [k, v] of Object.entries(extra)) {
        if (!(k in payload)) payload[k] = v
      }
    }

    try {
      await sendWebhook({
        url: config.webhookUrl,
        payload,
        authType,
        authToken: token,
      })
    } catch (err) {
      await this.bankTxRepo.releaseNotification(bankTransactionId)
      throw err
    }
  }
}
