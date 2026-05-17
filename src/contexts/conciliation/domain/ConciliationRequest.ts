import { AggregateRoot } from '../../../shared/domain/AggregateRoot.js'
import { ValidationError, ConflictError } from '../../../shared/errors/index.js'
import { ConciliationMatchedEvent } from '../../../shared/events/events/ConciliationMatched.event.js'
import { ConciliationFailedEvent } from '../../../shared/events/events/ConciliationFailed.event.js'
import { ConciliationExpiredEvent } from '../../../shared/events/events/ConciliationExpired.event.js'
import { ConciliationCancelledEvent } from '../../../shared/events/events/ConciliationCancelled.event.js'

export type ConciliationStatus =
  | 'pending' | 'processing' | 'matched'
  | 'not_found' | 'ambiguous' | 'failed' | 'expired' | 'cancelled'

const TERMINAL_STATUSES: ReadonlyArray<ConciliationStatus> = [
  'matched', 'cancelled', 'expired',
]

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

export type CreateProps = Omit<Props, 'status' | 'retryCount' | 'createdAt'>

export class ConciliationRequest extends AggregateRoot<string> {
  private props: Props

  private constructor(id: string, props: Props) {
    super(id)
    this.props = props
  }

  static create(id: string, props: CreateProps): ConciliationRequest {
    if (!props.accountId) throw new ValidationError('accountId is required')
    if (!props.externalId) throw new ValidationError('externalId is required')
    if (!Number.isFinite(props.expectedAmount) || props.expectedAmount <= 0) {
      throw new ValidationError('expectedAmount must be a positive number', {
        expectedAmount: props.expectedAmount,
      })
    }
    if (!props.currency || props.currency.length < 3) {
      throw new ValidationError('currency must be a 3+ letter code', { currency: props.currency })
    }
    return new ConciliationRequest(id, {
      ...props,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
    })
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

  isTerminal(): boolean {
    return TERMINAL_STATUSES.includes(this.props.status)
  }

  private guardNotTerminal(action: string) {
    if (this.isTerminal()) {
      throw new ConflictError(`Cannot ${action} from terminal status '${this.props.status}'`)
    }
  }

  markProcessing() {
    this.guardNotTerminal('markProcessing')
    this.props.status = 'processing'
    this.props.lastCheckedAt = new Date()
  }

  markMatched(bankTransactionId: string) {
    if (!bankTransactionId) throw new ValidationError('bankTransactionId is required')
    this.guardNotTerminal('markMatched')
    this.props.status = 'matched'
    this.addDomainEvent(new ConciliationMatchedEvent(this._id, this.props.accountId, bankTransactionId))
  }

  markNotFound() {
    this.guardNotTerminal('markNotFound')
    this.props.status = 'not_found'
    this.props.retryCount++
    this.addDomainEvent(new ConciliationFailedEvent(this._id, this.props.accountId, 'not_found'))
  }

  markAmbiguous() {
    this.guardNotTerminal('markAmbiguous')
    this.props.status = 'ambiguous'
    this.addDomainEvent(new ConciliationFailedEvent(this._id, this.props.accountId, 'ambiguous'))
  }

  markFailed() {
    this.guardNotTerminal('markFailed')
    this.props.status = 'failed'
    this.props.retryCount++
    this.addDomainEvent(new ConciliationFailedEvent(this._id, this.props.accountId, 'system_error'))
  }

  markExpired() {
    if (this.isTerminal()) return
    this.props.status = 'expired'
    this.addDomainEvent(new ConciliationExpiredEvent(this._id, this.props.accountId))
  }

  markCancelled() {
    if (this.isTerminal()) return
    this.props.status = 'cancelled'
    this.addDomainEvent(new ConciliationCancelledEvent(this._id, this.props.accountId))
  }
}
