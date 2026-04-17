import { AggregateRoot } from '../../../shared/domain/AggregateRoot.js'
import { ConciliationMatchedEvent } from '../../../shared/events/events/ConciliationMatched.event.js'
import { ConciliationFailedEvent } from '../../../shared/events/events/ConciliationFailed.event.js'
import { ConciliationExpiredEvent } from '../../../shared/events/events/ConciliationExpired.event.js'
import { ConciliationCancelledEvent } from '../../../shared/events/events/ConciliationCancelled.event.js'

export type ConciliationStatus =
  | 'pending' | 'processing' | 'matched'
  | 'not_found' | 'ambiguous' | 'failed' | 'expired' | 'cancelled'

interface Props {
  accountId: string
  externalId: string
  expectedAmount: number
  currency: string
  senderName?: string
  status: ConciliationStatus
  idempotencyKey?: string
  retryCount: number
  lastCheckedAt?: Date
  createdAt: Date
}

export class ConciliationRequest extends AggregateRoot<string> {
  private props: Props

  private constructor(id: string, props: Props) {
    super(id)
    this.props = props
  }

  static create(id: string, props: Omit<Props, 'status' | 'retryCount' | 'createdAt'>): ConciliationRequest {
    return new ConciliationRequest(id, { ...props, status: 'pending', retryCount: 0, createdAt: new Date() })
  }

  static reconstitute(id: string, props: Props): ConciliationRequest {
    return new ConciliationRequest(id, props)
  }

  get accountId()       { return this.props.accountId }
  get externalId()      { return this.props.externalId }
  get expectedAmount()  { return this.props.expectedAmount }
  get currency()        { return this.props.currency }
  get senderName()      { return this.props.senderName }
  get status()          { return this.props.status }
  get idempotencyKey()  { return this.props.idempotencyKey }
  get retryCount()      { return this.props.retryCount }
  get lastCheckedAt()   { return this.props.lastCheckedAt }
  get createdAt()       { return this.props.createdAt }

  markProcessing() {
    this.props.status = 'processing'
    this.props.lastCheckedAt = new Date()
  }

  markMatched(bankTransactionId: string) {
    this.props.status = 'matched'
    this.addDomainEvent(new ConciliationMatchedEvent(this._id, this.props.accountId, bankTransactionId))
  }

  markNotFound() {
    this.props.status = 'not_found'
    this.props.retryCount++
    this.addDomainEvent(new ConciliationFailedEvent(this._id, this.props.accountId, 'not_found'))
  }

  markAmbiguous() {
    this.props.status = 'ambiguous'
    this.addDomainEvent(new ConciliationFailedEvent(this._id, this.props.accountId, 'ambiguous'))
  }

  markFailed() {
    this.props.status = 'failed'
    this.props.retryCount++
    this.addDomainEvent(new ConciliationFailedEvent(this._id, this.props.accountId, 'system_error'))
  }

  markExpired() {
    this.props.status = 'expired'
    this.addDomainEvent(new ConciliationExpiredEvent(this._id, this.props.accountId))
  }

  markCancelled() {
    this.props.status = 'cancelled'
    this.addDomainEvent(new ConciliationCancelledEvent(this._id, this.props.accountId))
  }
}
