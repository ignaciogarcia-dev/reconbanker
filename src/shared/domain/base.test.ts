import { describe, expect, it } from 'vitest'
import { AggregateRoot } from './AggregateRoot.js'
import { Entity } from './Entity.js'
import { ValueObject } from './ValueObject.js'
import type { DomainEvent } from '../events/DomainEvent.js'

class TestEntity extends Entity<string> {}

class TestValueObject extends ValueObject<{ a: number; b: string }> {
  get a() {
    return this.props.a
  }
}

class TestAggregate extends AggregateRoot<string> {
  emit(event: DomainEvent) {
    this.addDomainEvent(event)
  }
}

const fakeEvent = (type = 'Test'): DomainEvent => ({
  eventType: type,
  occurredAt: new Date(),
  aggregateId: 'agg-1',
})

describe('Entity', () => {
  it('exposes id', () => {
    const e = new TestEntity('id-1')
    expect(e.id).toBe('id-1')
  })

  it('is equal to another entity with the same id', () => {
    const a = new TestEntity('x')
    const b = new TestEntity('x')
    expect(a.equals(b)).toBe(true)
  })

  it('is not equal to an entity with a different id', () => {
    const a = new TestEntity('x')
    const b = new TestEntity('y')
    expect(a.equals(b)).toBe(false)
  })
})

describe('ValueObject', () => {
  it('freezes props after construction', () => {
    const vo = new TestValueObject({ a: 1, b: 'x' })
    expect(Object.isFrozen((vo as unknown as { props: object }).props)).toBe(true)
  })

  it('is equal when props are structurally equal', () => {
    const a = new TestValueObject({ a: 1, b: 'x' })
    const b = new TestValueObject({ a: 1, b: 'x' })
    expect(a.equals(b)).toBe(true)
  })

  it('is not equal when props differ', () => {
    const a = new TestValueObject({ a: 1, b: 'x' })
    const b = new TestValueObject({ a: 2, b: 'x' })
    expect(a.equals(b)).toBe(false)
  })
})

describe('AggregateRoot', () => {
  it('starts with no domain events', () => {
    const agg = new TestAggregate('id-1')
    expect(agg.domainEvents).toEqual([])
  })

  it('accumulates emitted events', () => {
    const agg = new TestAggregate('id-1')
    const e1 = fakeEvent('A')
    const e2 = fakeEvent('B')
    agg.emit(e1)
    agg.emit(e2)
    expect(agg.domainEvents).toEqual([e1, e2])
  })

  it('clears accumulated events', () => {
    const agg = new TestAggregate('id-1')
    agg.emit(fakeEvent())
    agg.clearDomainEvents()
    expect(agg.domainEvents).toEqual([])
  })
})
