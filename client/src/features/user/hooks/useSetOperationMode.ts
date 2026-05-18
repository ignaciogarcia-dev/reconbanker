import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setOperationMode } from '../api/me'
import { meQueryKey } from './useUser'

export function useSetOperationMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setOperationMode,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meQueryKey })
      // TODO(Task 9): also invalidate accounts/conciliations/movements when those keys exist
    },
  })
}
