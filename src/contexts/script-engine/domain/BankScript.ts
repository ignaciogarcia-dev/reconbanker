import { AggregateRoot } from '../../../shared/domain/AggregateRoot.js'
import { ValidationError, ConflictError } from '../../../shared/errors/index.js'
import { ScriptPromotedEvent } from '../../../shared/events/events/ScriptPromoted.event.js'

export type ScriptStatus = 'draft' | 'testing' | 'review' | 'active' | 'deprecated' | 'failed'
export type ScriptOrigin = 'system' | 'ai' | 'user'
export type FlowType = 'login' | 'extract_transactions' | 'verify_payment'

const VALID_STATUS: ReadonlyArray<ScriptStatus> = [
  'draft', 'testing', 'review', 'active', 'deprecated', 'failed',
]
const VERSION_RE = /^\d+\.\d+\.\d+$/

interface Props {
  bank: string
  flowType: FlowType
  version: string
  status: ScriptStatus
  origin: ScriptOrigin
  baseScriptId?: string
  codeSnapshot?: string
  selectorMap: Record<string, unknown>
  createdAt: Date
}

export class BankScript extends AggregateRoot<string> {
  private props: Props

  private constructor(id: string, props: Props) {
    super(id)
    this.props = props
  }

  static create(id: string, props: Omit<Props, 'createdAt'>): BankScript {
    if (!props.bank) throw new ValidationError('bank is required')
    if (!props.flowType) throw new ValidationError('flowType is required')
    if (!VERSION_RE.test(props.version)) {
      throw new ValidationError('version must be semver-like (x.y.z)', { version: props.version })
    }
    if (!VALID_STATUS.includes(props.status)) {
      throw new ValidationError('invalid status', { status: props.status })
    }
    return new BankScript(id, { ...props, createdAt: new Date() })
  }

  static reconstitute(id: string, props: Props): BankScript {
    return new BankScript(id, props)
  }

  get bank()         { return this.props.bank }
  get flowType()     { return this.props.flowType }
  get version()      { return this.props.version }
  get status()       { return this.props.status }
  get origin()       { return this.props.origin }
  get baseScriptId() { return this.props.baseScriptId }
  get codeSnapshot() { return this.props.codeSnapshot }
  get selectorMap()  { return this.props.selectorMap }
  get createdAt()    { return this.props.createdAt }

  isActive(): boolean { return this.props.status === 'active' }

  promote(): void {
    if (this.props.status !== 'review') {
      throw new ConflictError(
        `Only scripts in review can be promoted (current: ${this.props.status})`
      )
    }
    this.props.status = 'active'
    this.addDomainEvent(new ScriptPromotedEvent(this.id, this.props.bank, this.props.flowType, this.props.version))
  }

  deprecate(): void {
    if (this.props.status === 'deprecated') return
    this.props.status = 'deprecated'
  }
}
