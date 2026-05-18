import { AggregateRoot } from '../../../shared/domain/AggregateRoot.js'
import { ValidationError } from '../../../shared/errors/index.js'

export type BankStatus = 'pending' | 'onboarding' | 'ready' | 'failed'

interface BankProps {
  code: string
  name: string
  loginUrl?: string
  status: BankStatus
  createdAt: Date
}

export class Bank extends AggregateRoot<string> {
  private props: BankProps

  private constructor(id: string, props: BankProps) {
    super(id)
    this.props = props
  }

  static create(id: string, code: string, name: string, loginUrl?: string): Bank {
    if (!code || !code.trim()) throw new ValidationError('code is required')
    if (!name || !name.trim()) throw new ValidationError('name is required')
    return new Bank(id, {
      code: code.trim(),
      name: name.trim(),
      loginUrl: loginUrl?.trim() || undefined,
      status: 'pending',
      createdAt: new Date(),
    })
  }

  static reconstitute(id: string, props: BankProps): Bank {
    return new Bank(id, props)
  }

  get code()      { return this.props.code }
  get name()      { return this.props.name }
  get loginUrl()  { return this.props.loginUrl }
  get status()    { return this.props.status }
  get createdAt() { return this.props.createdAt }
}
