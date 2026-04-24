import { db } from '../../../shared/infrastructure/db/client.js'
import { sendWebhook } from '../../../shared/infrastructure/webhooks/WebhookSender.js'

interface JobData { requestId: string }

export class NotifyWebhookUseCase {
  async execute({ requestId }: JobData): Promise<void> {
    const { rows: [req] } = await db.query(
      `SELECT cr.id, cr.external_id, cr.status, cr.expected_amount, cr.currency, cr.sender_name,
              ac.webhook_url, ac.webhook_auth_type, ac.webhook_auth_token, ac.auth_type, ac.auth_token,
              ac.polling_body, ac.webhook_extra_fields
       FROM conciliation_requests cr
       JOIN account_config ac ON ac.account_id = cr.account_id
       WHERE cr.id = $1`,
      [requestId]
    )
    if (!req?.webhook_url || !['matched', 'ambiguous', 'expired'].includes(req.status)) return

    const match = req.status === 'matched'
      ? (await db.query(
          `SELECT id FROM conciliated_transactions WHERE request_id = $1 AND is_primary = true`,
          [requestId]
        )).rows[0]
      : null

    const webhookToken = typeof req.webhook_auth_token === 'string' && req.webhook_auth_token.trim()
      ? req.webhook_auth_token.trim()
      : typeof req.auth_token === 'string' && req.auth_token.trim()
        ? req.auth_token.trim()
        : null
    const webhookAuthType = (req.webhook_auth_type ?? req.auth_type ?? 'bearer') as 'bearer' | 'api_key'

    const payload: Record<string, unknown> = {
      external_id: req.external_id,
      status:      req.status,
      amount:      Number(req.expected_amount),
      currency:    req.currency,
      sender_name: req.sender_name ?? null,
    }

    const extraFields = req.webhook_extra_fields
    if (extraFields && typeof extraFields === 'object' && !Array.isArray(extraFields)) {
      for (const [k, v] of Object.entries(extraFields)) {
        if (!(k in payload)) payload[k] = v
      }
    }

    const pollingBody = req.polling_body
    if (pollingBody && typeof pollingBody === 'object' && pollingBody.payment_method_id != null) {
      payload.payment_method_id = pollingBody.payment_method_id
    }

    await sendWebhook({
      url: req.webhook_url,
      payload,
      authType: webhookAuthType,
      authToken: webhookToken,
    })

    if (match) {
      await db.query(`UPDATE conciliated_transactions SET is_notified=true WHERE id=$1`, [match.id])
    }
  }
}
