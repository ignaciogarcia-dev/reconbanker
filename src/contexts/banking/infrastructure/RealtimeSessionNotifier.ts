import { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'
import { SystemEvent, SystemEventType, toNotifiableType } from '../../../shared/infrastructure/realtime/events.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'
import { ISessionLifecycleNotifier } from '../domain/ports/ISessionLifecycleNotifier.js'

// Emits persistent-session lifecycle events onto the realtime bus, mirroring
// RealtimeScrapeFailureNotifier: always fan out to the dashboard (drives the live light),
// and enqueue a webhook/Slack only for externally notifiable types (needs_attention).
export class RealtimeSessionNotifier implements ISessionLifecycleNotifier {
  constructor(
    private readonly bus: RealtimeBus,
    private readonly logger?: ILogger,
  ) {}

  private emit(type: SystemEventType, userId: string, accountId: string, data?: Record<string, unknown>, notify = true): void {
    const event: SystemEvent = { type, userId, accountId, data, occurredAt: new Date().toISOString() }
    void this.bus.publishUserEvent(event).catch((e) => this.logger?.warn('publish failed', { error: String(e) }))
    if (notify && toNotifiableType(type)) {
      void this.bus.enqueueNotification(event).catch((e) => this.logger?.warn('notify enqueue failed', { error: String(e) }))
    }
  }

  emitStarted({ userId, accountId }: { userId: string; accountId: string }): void {
    this.emit('session.started', userId, accountId)
  }

  emitStopped({ userId, accountId, reason }: { userId: string; accountId: string; reason: string }): void {
    this.emit('session.stopped', userId, accountId, { reason })
  }

  emitNeedsAttention({ userId, accountId, reason, notify = true }: { userId: string; accountId: string; reason: string; notify?: boolean }): void {
    this.emit('session.needs_attention', userId, accountId, { reason }, notify)
  }

  emitRecovered({ userId, accountId }: { userId: string; accountId: string }): void {
    this.emit('session.recovered', userId, accountId)
  }
}
