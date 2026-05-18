import { useQuery, useMutation } from '@tanstack/react-query'
import { listConciliations, getConciliation, enqueueRun, enqueueNotify, enqueuePoll } from '../api/conciliations'
import type { ListFilter } from '../types'

export const conciliationsQueryKey = ['conciliations'] as const

export function useConciliations(filter: ListFilter = {}) {
  return useQuery({
    queryKey: [...conciliationsQueryKey, filter] as const,
    queryFn: () => listConciliations(filter),
  })
}

export function useConciliation(requestId: string | undefined) {
  return useQuery({
    queryKey: ['conciliation', requestId] as const,
    queryFn: () => getConciliation(requestId!),
    enabled: !!requestId,
  })
}

export function useRunConciliation() {
  return useMutation({ mutationFn: enqueueRun })
}

export function useNotifyConciliation() {
  return useMutation({ mutationFn: enqueueNotify })
}

export function usePollConciliation() {
  return useMutation({ mutationFn: enqueuePoll })
}
