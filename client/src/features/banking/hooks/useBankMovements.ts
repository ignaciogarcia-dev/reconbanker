import { toast } from 'sonner'
import { localizedApiError } from '@/shared/http/client'
import i18n from '@/shared/i18n'
import { useQuery, useMutation } from '@tanstack/react-query'
import { listBankMovements, reNotifyMovement } from '../api/movements'

export const bankMovementsQueryKey = (accountId: string | undefined) =>
  ['bank-movements', accountId] as const

export function useBankMovements(accountId: string | undefined, limit = 100, offset = 0) {
  return useQuery({
    queryKey: [...bankMovementsQueryKey(accountId), limit, offset] as const,
    queryFn: () => listBankMovements(accountId!, limit, offset),
    enabled: !!accountId,
  })
}

export function useReNotifyMovement(accountId: string) {
  return useMutation({
    mutationFn: (movementId: string) => reNotifyMovement(accountId, movementId),
    onError: (err) => toast.error(localizedApiError(err) ?? i18n.t('banking:movements.renotifyError')),
  })
}
