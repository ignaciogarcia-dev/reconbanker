export type AssistanceType = 'otp'
export type AssistanceStatus = 'pending' | 'fulfilled' | 'expired' | 'cancelled'

export interface OtpDescriptor {
  length: number
  type: 'numeric' | 'alphanumeric'
  purpose?: string
}

export interface AssistanceRequest {
  id: string
  accountId: string
  sessionId: string | null
  type: AssistanceType
  status: AssistanceStatus
  descriptor: OtpDescriptor
  attempts: number
  createdAt: Date
  updatedAt: Date
  fulfilledAt: Date | null
}
