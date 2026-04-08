import { db } from '../../../shared/infrastructure/db/client.js'

interface JobData { requestId: string }

export class NotifyWebhookUseCase {
  async execute({ requestId }: JobData): Promise<void> {
    const { rows: [req] } = await db.query(
      `SELECT cr.id, cr.external_id, cr.status, cr.expected_amount, cr.currency, cr.sender_name,
              ac.webhook_url, ac.webhook_auth_type, ac.webhook_auth_token
       FROM conciliation_requests cr
       JOIN account_config ac ON ac.account_id = cr.account_id
       WHERE cr.id = $1`,
      [requestId]
    )
    if (!req?.webhook_url || req.status !== 'matched') return

    const { rows: [match] } = await db.query(
      `SELECT id FROM conciliated_transactions WHERE request_id = $1 AND is_primary = true`,
      [requestId]
    )

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const webhookToken = typeof req.webhook_auth_token === 'string' && req.webhook_auth_token.trim()
      ? req.webhook_auth_token.trim()
      : null
    if (webhookToken) {
      if (req.webhook_auth_type === 'api_key') headers['Authorization'] = `Api-Key ${webhookToken}`
      else headers['Authorization'] = `Bearer ${webhookToken}`
    }

    const webhookBody = JSON.stringify({
      external_id: req.external_id,
      amount:      Number(req.expected_amount),
      currency:    req.currency,
      sender_name: req.sender_name ?? null,
    })
    console.log(`[webhook] POST ${req.webhook_url}`)
    console.log(`[webhook] headers:`, JSON.stringify(headers))
    console.log(`[webhook] body:`, webhookBody)

    const response = await fetch(req.webhook_url, {
      method: 'POST',
      headers,
      body: webhookBody,
    })

    const responseBody = await response.text().catch(() => '')
    console.log(`[webhook] response: ${response.status} ${response.statusText} — ${responseBody}`)

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}` + (responseBody ? ` — ${responseBody.slice(0, 300)}` : ''))
    }

    if (match) {
      await db.query(`UPDATE conciliated_transactions SET is_notified=true WHERE id=$1`, [match.id])
    }
  }
}
