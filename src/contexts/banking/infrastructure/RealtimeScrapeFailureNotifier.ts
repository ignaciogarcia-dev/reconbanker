import { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'
import { SystemEvent, SystemEventType, toNotifiableType } from '../../../shared/infrastructure/realtime/events.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'
import { IScrapeFailureNotifier } from '../domain/ports/IScrapeFailureNotifier.js'
import { FailureGroup, IScrapeFailureAlertStore } from '../domain/ports/IScrapeFailureAlertStore.js'
import { FailureCategory, notifiableInternalType } from '../domain/scrapeFailure.js'

const DEFAULT_THRESHOLD = 3

// Mirrors OtpAssistanceCoordinator.emit() (dashboard fan-out + webhook enqueue) but throttles the
// external alert: the dashboard reflects every failure live, while Slack/webhook only fire once a
// group reaches the consecutive-failure threshold, and a recovery notice is sent on the next success.
export class RealtimeScrapeFailureNotifier implements IScrapeFailureNotifier {
  constructor(
    private readonly bus: RealtimeBus,
    private readonly store: IScrapeFailureAlertStore,
    private readonly threshold: number = DEFAULT_THRESHOLD,
    private readonly logger?: ILogger,
  ) {}

  async recordFailure({ userId, accountId, category }: { userId: string; accountId: string; category: FailureCategory }): Promise<void> {
    const internalType = notifiableInternalType(category) // 'connection.failed' | 'scrape.failed'
    const group: FailureGroup = internalType === 'connection.failed' ? 'connection' : 'scrape'
    const event = this.buildEvent(internalType, userId, accountId, { category })

    // Dashboard always reflects the live failure (drives the per-account light); only the external
    // alert waits for the threshold.
    await this.publish(event)

    try {
      const { streak, alerted } = await this.store.recordFailure(accountId, group)
      if (streak >= this.threshold && !alerted) {
        await this.store.markAlerted(accountId, group)
        await this.enqueue(event)
      }
    } catch (e) {
      this.logger?.warn('failure alert bookkeeping failed', { accountId, group, error: String(e) })
    }
  }

  async recordSuccess({ userId, accountId }: { userId: string; accountId: string }): Promise<void> {
    // A full successful scrape proves both connection and extraction work, so clear both groups.
    for (const group of ['connection', 'scrape'] as const) {
      try {
        const { wasAlerted } = await this.store.clear(accountId, group)
        if (!wasAlerted) continue // never alerted → nothing to recover from
        const type: SystemEventType = group === 'connection' ? 'connection.recovered' : 'scrape.recovered'
        const event = this.buildEvent(type, userId, accountId, {})
        await this.publish(event)
        await this.enqueue(event)
      } catch (e) {
        this.logger?.warn('recovery bookkeeping failed', { accountId, group, error: String(e) })
      }
    }
  }

  private buildEvent(type: SystemEventType, userId: string, accountId: string, data: Record<string, unknown>): SystemEvent {
    return { type, userId, accountId, data, occurredAt: new Date().toISOString() }
  }

  private async publish(event: SystemEvent): Promise<void> {
    await this.bus.publishUserEvent(event).catch((e) => this.logger?.warn('publish failed', { error: String(e) }))
  }

  private async enqueue(event: SystemEvent): Promise<void> {
    if (!toNotifiableType(event.type)) return
    await this.bus.enqueueNotification(event).catch((e) => this.logger?.warn('notify enqueue failed', { error: String(e) }))
  }
}
