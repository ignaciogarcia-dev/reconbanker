import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setOperationMode } from '../api/me'
import { meQueryKey } from './useUser'
import { accountsQueryKey } from '@/features/account/hooks/useAccounts'
import { conciliationsQueryKey } from '@/features/conciliation/hooks/useConciliations'

export function useSetOperationMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setOperationMode,
    meta: { errorHandled: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meQueryKey })
      qc.invalidateQueries({ queryKey: accountsQueryKey })
      qc.invalidateQueries({ queryKey: conciliationsQueryKey })
      // bankMovementsQueryKey is a function (accountId) => ['bank-movements', accountId];
      // use the literal base for partial-match invalidation of all account scopes.
      qc.invalidateQueries({ queryKey: ['bank-movements'] })
    },
  })
}
