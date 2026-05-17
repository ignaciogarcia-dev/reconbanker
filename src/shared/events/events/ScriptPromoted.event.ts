import { DomainEvent } from '../DomainEvent.js'

export class ScriptPromotedEvent implements DomainEvent {
  readonly eventType = 'ScriptPromoted'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string,
    readonly bank: string,
    readonly flowType: string,
    readonly version: string,
  ) {}
}
