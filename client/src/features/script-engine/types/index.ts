export type ScriptStatus = 'draft' | 'testing' | 'review' | 'active' | 'deprecated' | 'failed'

export interface Script {
  id: string
  bank: string
  flowType: string
  version: string
  status: ScriptStatus
  origin: string
  createdAt: string
}
