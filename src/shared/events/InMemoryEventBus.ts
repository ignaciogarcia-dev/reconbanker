import type { DomainEvent } from './DomainEvent.js'
import type { IEventBus, EventHandler } from './IEventBus.js'
import type { Logger } from '../infrastructure/logger/index.js'

export class InMemoryEventBus implements IEventBus {
  private handlers = new Map<string, EventHandler<any>[]>()

  constructor(private readonly logger?: Logger) {}

  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void {
    const existing = this.handlers.get(eventType) ?? []
    this.handlers.set(eventType, [...existing, handler])
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? []
    const results = await Promise.allSettled(handlers.map((h) => h(event)))
    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger?.error('event handler failed', {
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        })
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event)
    }
  }
}
