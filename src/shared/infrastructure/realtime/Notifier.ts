import { realtimeBus } from './RealtimeBus.js'
import { SystemEvent, toNotifiableType } from './events.js'
import { sendWebhook } from '../webhooks/WebhookSender.js'
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
    if (!config?.notificationEndpointUrl) return
    const subscribed = config.notificationEvents ?? []
    if (!subscribed.includes(notifiable)) return

    try {
      await sendWebhook({
        url: config.notificationEndpointUrl,
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
      log.info('notification delivered', { accountId: event.accountId, type: notifiable })
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
