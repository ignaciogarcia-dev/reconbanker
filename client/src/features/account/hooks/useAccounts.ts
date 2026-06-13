import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAccounts, createAccount, deleteAccount, enqueueScrape, getAccount } from '../api/accounts'

export const accountsQueryKey = ['accounts'] as const

export function useAccounts() {
  return useQuery({ queryKey: accountsQueryKey, queryFn: listAccounts })
}

export function useAccount(accountId: string | undefined) {
  return useQuery({
    queryKey: ['account', accountId],
    queryFn: () => getAccount(accountId!),
    enabled: !!accountId,
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQueryKey }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, confirmationName }: { accountId: string; confirmationName: string }) =>
      deleteAccount(accountId, confirmationName),
    meta: { errorHandled: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQueryKey }),
  })
}

export function useEnqueueScrape() {
  return useMutation({ mutationFn: enqueueScrape })
}
