import { logger } from '../logger/index.js'

const log = logger.child('[slack]')

const SLACK_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage'
const SLACK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 15_000)

interface SendSlackMessageOptions {
  token: string
  channel: string
  text: string
}

// Posts a message to a Slack channel via chat.postMessage.
// Slack returns HTTP 200 even on logical failures with `{ ok: false, error }`, so we must
// inspect the body — not just the HTTP status — and throw so the Notifier stream redelivers.
export async function sendSlackMessage({ token, channel, text }: SendSlackMessageOptions): Promise<void> {
  const response = await fetch(SLACK_POST_MESSAGE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
    redirect: 'error',
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  })

  const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null

  if (!response.ok || !body?.ok) {
    const reason = body?.error ?? `HTTP ${response.status} ${response.statusText}`
    log.warn('slack post failed', { channel, reason })
    throw new Error(`Slack chat.postMessage failed: ${reason}`)
  }

  log.info('slack message delivered', { channel })
}
