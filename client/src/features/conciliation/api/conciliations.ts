import { httpClient } from '@/shared/http/client'
import type {
  ConciliationRequestListItem, ConciliationRequestDetail, ListFilter,
} from '../types'

export async function listConciliations(filter: ListFilter = {}): Promise<ConciliationRequestListItem[]> {
  const { data } = await httpClient.get<ConciliationRequestListItem[]>('/conciliation', {
    params: { limit: filter.limit ?? 50, offset: filter.offset ?? 0, status: filter.status },
  })
  return data
}

export async function getConciliation(requestId: string): Promise<ConciliationRequestDetail> {
  const { data } = await httpClient.get<ConciliationRequestDetail>(`/conciliation/${requestId}`)
  return data
}

export async function enqueueRun(requestId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/conciliation/${requestId}/run`)
  return data
}

export async function enqueueNotify(requestId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/conciliation/${requestId}/notify`)
  return data
}

export async function enqueuePoll(accountId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/conciliation/poll/${accountId}`)
  return data
}
