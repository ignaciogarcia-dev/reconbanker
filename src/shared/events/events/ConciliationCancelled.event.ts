import { DomainEvent } from '../DomainEvent.js'

export class ConciliationCancelledEvent implements DomainEvent {
  readonly eventType = 'ConciliationCancelled'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string,
    readonly accountId: string,
  ) {}
}
