import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export type OperationMode = 'reconcile' | 'passthrough'

export interface Me {
  id: string
  email: string
  name: string | null
  operation_mode: OperationMode | null
}

export function useUser() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => api.get('/me').then(r => r.data),
  })
}

export function useSetOperationMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mode: OperationMode) =>
      api.put('/me/operation-mode', { mode }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['conciliations'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    },
  })
}
