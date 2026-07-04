import { logger } from '../logger/index.js'
import { assertSafeUrl } from '../../net/assertSafeUrl.js'

const log = logger.child('[chat-webhook]')

const CHAT_WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 15_000)

interface SendChatWebhookOptions {
  url: string
  text: string
}

// Carries the HTTP status + raw body of a failed delivery, mirroring WebhookError so callers
// (and future dead-letter handling) can inspect the failure, not just its message.
export interface ChatWebhookError extends Error {
  status: number
  body: string
}

// Posts a plain `{ text }` message to an incoming-webhook URL (Slack incoming webhook,
// Mattermost, or any endpoint that accepts a top-level `text`). No auth header — the secret
// lives in the URL. Throws on non-2xx so the Notifier leaves the stream entry un-acked for retry.
export async function sendChatWebhook({ url, text }: SendChatWebhookOptions): Promise<void> {
  // Re-validate at send time (DNS rebinding / TOCTOU), like WebhookSender.
  await assertSafeUrl(url, 'chat_webhook_url')

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    redirect: 'error',
    signal: AbortSignal.timeout(CHAT_WEBHOOK_TIMEOUT_MS),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    log.warn('chat webhook post failed', { status: response.status, body: body.slice(0, 300) })
    const error = new Error(
      `Chat webhook failed: ${response.status} ${response.statusText}` +
      (body ? ` — ${body.slice(0, 300)}` : '')
    ) as ChatWebhookError
    error.status = response.status
    error.body = body
    throw error
  }

  log.info('chat webhook delivered')
}
