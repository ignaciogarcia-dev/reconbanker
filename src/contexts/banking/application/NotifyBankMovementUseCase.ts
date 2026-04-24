import { db } from '../../../shared/infrastructure/db/client.js'
import { sendWebhook } from '../../../shared/infrastructure/webhooks/WebhookSender.js'

interface JobData { bankTransactionId: string }

export class NotifyBankMovementUseCase {
  async execute({ bankTransactionId }: JobData): Promise<void> {
    const { rows: [row] } = await db.query(
      `SELECT bt.id, bt.amount, bt.currency, bt.sender_name, bt.received_at, bt.notified_at,
              ac.mode, ac.webhook_url, ac.webhook_auth_type, ac.webhook_auth_token,
              ac.auth_type, ac.auth_token, ac.webhook_extra_fields
         FROM bank_transactions bt
         JOIN account_config ac ON ac.account_id = bt.account_id
        WHERE bt.id = $1`,
      [bankTransactionId]
    )

    if (!row) return
    if (row.mode !== 'passthrough') return
    if (row.notified_at != null) return
    if (!row.webhook_url) return

    const token = typeof row.webhook_auth_token === 'string' && row.webhook_auth_token.trim()
      ? row.webhook_auth_token.trim()
      : typeof row.auth_token === 'string' && row.auth_token.trim()
        ? row.auth_token.trim()
        : null
    const authType = (row.webhook_auth_type ?? row.auth_type ?? 'bearer') as 'bearer' | 'api_key'

    const payload: Record<string, unknown> = {
      id:          row.id,
      amount:      Number(row.amount),
      currency:    row.currency,
      sender_name: row.sender_name ?? null,
      received_at: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
    }

    const extra = row.webhook_extra_fields
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      for (const [k, v] of Object.entries(extra)) {
        if (!(k in payload)) payload[k] = v
      }
    }

    await sendWebhook({
      url: row.webhook_url,
      payload,
      authType,
      authToken: token,
    })

    await db.query(`UPDATE bank_transactions SET notified_at = now() WHERE id = $1`, [bankTransactionId])
  }
}
