import { AggregateRoot } from '../../../shared/domain/AggregateRoot.js'
import { ValidationError } from '../../../shared/errors/index.js'
import { AccountCreatedEvent } from '../../../shared/events/events/AccountCreated.event.js'

export type AccountStatus = 'active' | 'inactive'

interface AccountProps {
  userId: string
  bankId: string
  bank: string    // bank code, resolved from JOIN with banks table
  name?: string
  status: AccountStatus
  createdAt: Date
  // Set when a fatal scrape/session failure (e.g. bad credentials) blocks the
  // account from automatic triggers until an operator restarts it. null = unblocked.
  scrapeBlockedAt?: Date | null
  scrapeBlockedReason?: string | null
}

export class Account extends AggregateRoot<string> {
  private props: AccountProps

  private constructor(id: string, props: AccountProps) {
    super(id)
    this.props = props
  }

  static create(id: string, userId: string, bankId: string, bankCode: string, name?: string): Account {
    if (!userId) throw new ValidationError('userId is required')
    if (!bankId) throw new ValidationError('bankId is required')
    if (!bankCode) throw new ValidationError('bankCode is required')
    if (name !== undefined && !name.trim()) {
      throw new ValidationError('name cannot be blank when provided')
    }
    const account = new Account(id, {
      userId, bankId, bank: bankCode,
      name: name?.trim(),
      status: 'active', createdAt: new Date(),
      scrapeBlockedAt: null, scrapeBlockedReason: null,
    })
    account.addDomainEvent(new AccountCreatedEvent(id, bankCode, account.name))
    return account
  }

  static reconstitute(id: string, props: AccountProps): Account {
    return new Account(id, props)
  }

  get userId()  { return this.props.userId }
  get bankId()  { return this.props.bankId }
  get bank()    { return this.props.bank }
  get name()    { return this.props.name }
  get status()  { return this.props.status }
  get createdAt() { return this.props.createdAt }
  get scrapeBlockedAt()     { return this.props.scrapeBlockedAt ?? null }
  get scrapeBlockedReason() { return this.props.scrapeBlockedReason ?? null }

  belongsTo(userId: string): boolean {
    return this.props.userId === userId
  }
}
