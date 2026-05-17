import { DomainEvent } from '../DomainEvent.js'

export class OperationModeChangedEvent implements DomainEvent {
  readonly eventType = 'OperationModeChanged'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string,
    readonly mode: 'reconcile' | 'passthrough',
  ) {}
}
