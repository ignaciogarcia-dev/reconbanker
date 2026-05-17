import type { DomainEvent } from './DomainEvent.js'

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>

export interface IEventBus {
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void
  publish(event: DomainEvent): Promise<void>
  publishAll(events: DomainEvent[]): Promise<void>
}
