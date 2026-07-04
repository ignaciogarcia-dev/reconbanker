import { realtimeBus } from './RealtimeBus.js'
import { SystemEvent, toNotifiableType } from './events.js'
import { sendWebhook } from '../webhooks/WebhookSender.js'
import { sendSlackMessage } from './SlackSender.js'
import { sendChatWebhook } from './ChatWebhookSender.js'
import { formatSlackMessage, AccountLabel } from './slackMessage.js'
import type { Container } from '../../../composition/container.js'

export interface NotifierHandle {
  stop(): void
}

// Forwards subscribed events to each account's notification endpoint and the OTP path never depends on it so a down endpoint never blocks a scrape
export function startNotifier(container: Container): NotifierHandle {
  const log = container.logger.child('[notifier]')
  const configRepo = container.account.accountConfigRepository
  const signal = { stopped: false }

  const handle = async (event: SystemEvent): Promise<void> => {
    const notifiable = toNotifiableType(event.type)
    if (!notifiable) return // dashboard-only event

    const config = await configRepo.findByAccountId(event.accountId).catch(() => null)
    if (!config) return
    const subscribed = config.notificationEvents ?? []
    if (!subscribed.includes(notifiable)) return

    const transport = config.notificationTransport ?? 'api'
    if (transport === 'slack') {
      if (!config.notificationAuthToken || !config.notificationSlackChannel) return
    } else if (!config.notificationEndpointUrl) {
      return
    }

    try {
      if (transport === 'slack') {
        const label = await resolveAccountLabel(container, event.accountId)
        await sendSlackMessage({
          token: config.notificationAuthToken!,
          channel: config.notificationSlackChannel!,
          text: formatSlackMessage(event, label),
        })
      } else if (transport === 'chat_webhook') {
        const label = await resolveAccountLabel(container, event.accountId)
        await sendChatWebhook({
          url: config.notificationEndpointUrl!,
          text: formatSlackMessage(event, label),
        })
      } else {
        await sendWebhook({
          url: config.notificationEndpointUrl!,
          payload: {
            account_id: event.accountId,
            type: notifiable,
            status: event.type,
            data: event.data ?? null,
            occurred_at: event.occurredAt,
          },
          authType: config.notificationAuthType ?? null,
          authToken: config.notificationAuthToken ?? null,
        })
      }
      log.info('notification delivered', { accountId: event.accountId, type: notifiable, transport })
    } catch (err) {
      // Re-throw so the entry stays un-acked and XAUTOCLAIM redelivers it after the idle window
      log.warn('notification delivery failed; will retry', {
        accountId: event.accountId, type: notifiable,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  void realtimeBus
    .consumeNotifications(`notifier-${process.pid}`, handle, signal)
    .catch((err) => log.error('notifier loop crashed', { error: String(err) }))

  return { stop: () => { signal.stopped = true } }
}

// Resolves the friendly "Banco · alias" label for a Slack message. Best-effort: any missing repo,
// missing account, or lookup error yields undefined so formatSlackMessage falls back to "cuenta <id>".
async function resolveAccountLabel(container: Container, accountId: string): Promise<AccountLabel | undefined> {
  try {
    const account = await container.account.accountRepository?.findById(accountId)
    if (!account) return undefined
    const bank = await container.account.bankRepository?.findById(account.bankId)
    return { bankName: bank?.name ?? null, accountName: account.name ?? null }
  } catch {
    return undefined
  }
}
