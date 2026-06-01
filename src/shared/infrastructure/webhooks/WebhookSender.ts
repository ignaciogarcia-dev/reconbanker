import { logger } from '../logger/index.js'

const log = logger.child('[webhook]')

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
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  if (authToken) {
    headers['Authorization'] = authType === 'api_key' ? `Api-Key ${authToken}` : `Bearer ${authToken}`
  }

  const body = JSON.stringify(payload)
  log.debug(`POST ${url}`)
  log.debug(`headers`, { headers: { ...headers, Authorization: headers['Authorization'] ? '[REDACTED]' : undefined } })
  log.debug(`body`, { body })

  const response = await fetch(url, { method: 'POST', headers, body })
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
