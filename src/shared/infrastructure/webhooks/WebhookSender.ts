import { logger } from '../logger/index.js'

const log = logger.child('[webhook]')

interface SendWebhookOptions {
  url: string
  payload: Record<string, unknown>
  authType: 'bearer' | 'api_key' | null
  authToken: string | null
}

export async function sendWebhook({ url, payload, authType, authToken }: SendWebhookOptions): Promise<void> {
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
    throw new Error(
      `Webhook failed: ${response.status} ${response.statusText}` +
      (responseBody ? ` — ${responseBody.slice(0, 300)}` : '')
    )
  }
}
