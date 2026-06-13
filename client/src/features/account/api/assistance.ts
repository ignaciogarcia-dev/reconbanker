import { httpClient } from '@/shared/http/client'

export interface PendingAssistanceDto {
  id: string
  type: 'otp'
  descriptor: { length: number; type: 'numeric' | 'alphanumeric'; purpose?: string }
  attempts: number
}

// Recovers the pending assistance request on a page refresh without the live WebSocket event
export async function getPendingAssistance(accountId: string): Promise<PendingAssistanceDto | null> {
  const { data } = await httpClient.get<PendingAssistanceDto | null>(`/accounts/${accountId}/otp`)
  return data
}

export async function submitOtp(accountId: string, code: string): Promise<void> {
  await httpClient.post(`/accounts/${accountId}/otp`, { code })
}
