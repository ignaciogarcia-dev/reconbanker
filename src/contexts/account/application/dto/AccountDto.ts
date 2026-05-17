export interface AccountSummaryDto {
  id: string
  bank: string
  name: string | null
  status: string
}

export interface AccountDetailDto extends AccountSummaryDto {}
