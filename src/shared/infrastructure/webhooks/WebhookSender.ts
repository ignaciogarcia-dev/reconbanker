import crypto from 'node:crypto'
import { logger } from '../logger/index.js'
import { assertSafeUrl } from '../../net/assertSafeUrl.js'

const log = logger.child('[webhook]')

const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 15_000)

interface SendWebhookOptions {
  url: string
  payload: Record<string, unknown>
  authType: 'bearer' | 'api_key' | null
  authToken: string | null
}

export interface WebhookResult {
  status: number
  body: string
}

export interface WebhookError extends Error {
  status: number
  body: string
}

export async function sendWebhook({ url, payload, authType, authToken }: SendWebhookOptions): Promise<WebhookResult> {
  // Re-validate at send time, not just at config write: the host may now resolve
  // to an internal address (DNS change / TOCTOU) even though it was safe before.
  await assertSafeUrl(url, 'webhook_url')

  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  if (authToken) {
    headers['Authorization'] = authType === 'api_key' ? `Api-Key ${authToken}` : `Bearer ${authToken}`
  }

  const body = JSON.stringify(payload)

  // Recipients can verify authenticity/integrity (Stripe-style) when a signing
  // secret is configured. Signature covers `${timestamp}.${body}` to also bind
  // the timestamp and bound replay windows.
  const signingSecret = process.env.WEBHOOK_SIGNING_SECRET
  if (signingSecret) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = crypto.createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')
    headers['X-Webhook-Timestamp'] = timestamp
    headers['X-Signature-256'] = `sha256=${signature}`
  }

  log.debug(`POST ${url}`)
  log.debug(`headers`, { headers: { ...headers, Authorization: headers['Authorization'] ? '[REDACTED]' : undefined } })
  log.debug(`body`, { body })

  // redirect: 'error' stops a malicious endpoint from 3xx-redirecting us to an
  // internal address (SSRF) after assertSafeUrl validated the original host.
  const response = await fetch(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) })
  const responseBody = await response.text().catch(() => '')
  log.info(`response`, { status: response.status, statusText: response.statusText, body: responseBody })

  if (!response.ok) {
    const error = new Error(
      `Webhook failed: ${response.status} ${response.statusText}` +
      (responseBody ? ` — ${responseBody.slice(0, 300)}` : '')
    ) as WebhookError
    error.status = response.status
    error.body = responseBody
    throw error
  }

  return { status: response.status, body: responseBody }
}
