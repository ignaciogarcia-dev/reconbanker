import { httpClient } from '@/shared/http/client'
import type { BankMovement } from '../types'

interface BankMovementRow {
  id: string
  externalId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: string
  notifiedAt: string | null
  excludedAt: string | null
}

export async function listBankMovements(accountId: string, limit = 100, offset = 0): Promise<BankMovement[]> {
  const { data } = await httpClient.get<BankMovementRow[]>(
    `/accounts/${accountId}/movements`,
    { params: { limit, offset } }
  )
  return data.map((r) => ({
    id: r.id,
    externalId: r.externalId,
    amount: r.amount,
    currency: r.currency,
    senderName: r.senderName,
    receivedAt: r.receivedAt,
    notifiedAt: r.notifiedAt,
    excludedAt: r.excludedAt,
  }))
}

export async function reNotifyMovement(accountId: string, movementId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(
    `/accounts/${accountId}/movements/${movementId}/notify`
  )
  return data
}
