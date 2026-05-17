import type { BankScriptSummary } from '../../domain/ports/IBankScriptListReader.js'

export interface BankSummaryDto {
  id: string
  code: string
  name: string
  loginUrl: string | null
  status: string
}

export interface BankDetailDto extends BankSummaryDto {
  scripts: BankScriptSummary[]
}
