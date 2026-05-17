import { BankScript, FlowType, ScriptOrigin, ScriptStatus } from '../../domain/BankScript.js'

export interface BankScriptRow {
  id: string
  bank: string
  flow_type: FlowType
  version: string
  status: ScriptStatus
  origin: ScriptOrigin
  base_script_id: string | null
  code_snapshot: string | null
  selector_map: Record<string, unknown>
  created_at: Date
}

export const BankScriptRowMapper = {
  toAggregate(row: BankScriptRow): BankScript {
    return BankScript.reconstitute(row.id, {
      bank: row.bank,
      flowType: row.flow_type,
      version: row.version,
      status: row.status,
      origin: row.origin,
      baseScriptId: row.base_script_id ?? undefined,
      codeSnapshot: row.code_snapshot ?? undefined,
      selectorMap: row.selector_map,
      createdAt: row.created_at,
    })
  },
}
