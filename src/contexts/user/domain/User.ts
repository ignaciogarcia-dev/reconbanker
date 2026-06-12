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
  /** Base32 TOTP secret (plaintext in the domain; encrypted at rest). */
  totpSecret?: string | null
  totpEnabled?: boolean
  totpConfirmedAt?: Date | null
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
      throw new ValidationError('email is invalid')
    }
    if (!passwordHash) throw new ValidationError('passwordHash is required')
    return new User(id, {
      email: trimmedEmail,
      name: name?.trim() || null,
      passwordHash,
      operationMode: null,
      status: 'active',
      createdAt: new Date(),
      totpSecret: null,
      totpEnabled: false,
      totpConfirmedAt: null,
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
  get totpSecret()      { return this.props.totpSecret ?? null }
  get totpConfirmedAt() { return this.props.totpConfirmedAt ?? null }

  isActive(): boolean { return this.props.status === 'active' }

  isTotpEnabled(): boolean { return this.props.totpEnabled === true }

  /** Stores a freshly generated secret pending confirmation. Does not enable 2FA yet. */
  beginTotpEnrollment(secret: string): void {
    if (!secret?.trim()) throw new ValidationError('totp secret is required')
    this.props.totpSecret = secret
    this.props.totpEnabled = false
    this.props.totpConfirmedAt = null
  }

  /** Activates 2FA once the user has proven they can produce a valid code. */
  confirmTotp(): void {
    if (!this.props.totpSecret) {
      throw new ValidationError('cannot confirm TOTP before enrollment')
    }
    this.props.totpEnabled = true
    this.props.totpConfirmedAt = new Date()
  }

  /** Turns off 2FA and clears the stored secret. */
  disableTotp(): void {
    this.props.totpSecret = null
    this.props.totpEnabled = false
    this.props.totpConfirmedAt = null
  }

  changeOperationMode(mode: OperationMode): void {
    if (mode !== 'reconcile' && mode !== 'passthrough') {
      throw new ValidationError(`mode must be 'reconcile' or 'passthrough'`, { mode })
    }
    if (this.props.operationMode === mode) return
    this.props.operationMode = mode
    this.addDomainEvent(new OperationModeChangedEvent(this.id, mode))
  }
}
