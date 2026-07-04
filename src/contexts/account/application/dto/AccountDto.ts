import type { AccountSessionStatus } from '../../domain/IAccountRepository.js'

export interface AccountSummaryDto {
  id: string
  bank: string
  name: string | null
  status: string
  // Live persistent-session status for the dashboard light; absent on the detail view.
  sessionStatus?: AccountSessionStatus | null
  // Persistent + assisted: shows the manual start/reactivate button. Absent on the detail view.
  assistedPersistent?: boolean
}

export interface AccountDetailDto extends AccountSummaryDto {}
