export interface ScriptListItemDto {
  id: string
  bank: string
  flowType: string
  version: string
  status: string
  origin: string
  createdAt: Date
}

export interface ScriptDetailDto extends ScriptListItemDto {
  baseScriptId: string | null
  codeSnapshot: string | null
  selectorMap: Record<string, unknown>
}
