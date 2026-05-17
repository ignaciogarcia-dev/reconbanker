import { AggregateRoot } from '../../../shared/domain/AggregateRoot.js'
import { ValidationError } from '../../../shared/errors/index.js'
import { OperationModeChangedEvent } from '../../../shared/events/events/OperationModeChanged.event.js'

export type OperationMode = 'reconcile' | 'passthrough'
export type UserStatus = 'active' | 'inactive'

interface UserProps {
  email: string
  name: string | null
  passwordHash: string
  operationMode: OperationMode | null
  status: UserStatus
  createdAt: Date
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class User extends AggregateRoot<string> {
  private props: UserProps

  private constructor(id: string, props: UserProps) {
    super(id)
    this.props = props
  }

  static create(id: string, email: string, passwordHash: string, name?: string | null): User {
    const trimmedEmail = email?.trim().toLowerCase()
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      throw new ValidationError('email is invalid', { email })
    }
    if (!passwordHash) throw new ValidationError('passwordHash is required')
    return new User(id, {
      email: trimmedEmail,
      name: name?.trim() || null,
      passwordHash,
      operationMode: null,
      status: 'active',
      createdAt: new Date(),
    })
  }

  static reconstitute(id: string, props: UserProps): User {
    return new User(id, props)
  }

  get email()         { return this.props.email }
  get name()          { return this.props.name }
  get passwordHash()  { return this.props.passwordHash }
  get operationMode() { return this.props.operationMode }
  get status()        { return this.props.status }
  get createdAt()     { return this.props.createdAt }

  isActive(): boolean { return this.props.status === 'active' }

  changeOperationMode(mode: OperationMode): void {
    if (mode !== 'reconcile' && mode !== 'passthrough') {
      throw new ValidationError(`mode must be 'reconcile' or 'passthrough'`, { mode })
    }
    if (this.props.operationMode === mode) return
    this.props.operationMode = mode
    this.addDomainEvent(new OperationModeChangedEvent(this.id, mode))
  }
}
