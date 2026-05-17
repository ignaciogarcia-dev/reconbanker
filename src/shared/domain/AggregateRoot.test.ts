import { describe, it, expect } from 'vitest'
import { AggregateRoot } from './AggregateRoot.js'
import { DomainEvent } from '../events/DomainEvent.js'

class TestEvent implements DomainEvent {
  readonly eventType = 'TestEvent'
  readonly occurredAt = new Date()
  constructor(readonly aggregateId: string) {}
}

class TestAggregate extends AggregateRoot<string> {
  static create(id: string): TestAggregate {
    return new TestAggregate(id)
  }
  fire() {
    this.addDomainEvent(new TestEvent(this.id))
  }
}

describe('AggregateRoot', () => {
  it('starts with no domain events', () => {
    const a = TestAggregate.create('id-1')
    expect(a.domainEvents).toHaveLength(0)
  })

  it('accumulates and clears domain events', () => {
    const a = TestAggregate.create('id-1')
    a.fire()
    a.fire()
    expect(a.domainEvents).toHaveLength(2)
    expect(a.domainEvents[0].aggregateId).toBe('id-1')
    a.clearDomainEvents()
    expect(a.domainEvents).toHaveLength(0)
  })
})
