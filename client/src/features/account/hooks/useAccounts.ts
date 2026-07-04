import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAccounts, createAccount, deleteAccount, enqueueScrape, reactivateSession, getAccount, killSession } from '../api/accounts'

export const accountsQueryKey = ['accounts'] as const

export function useAccounts() {
  // Poll as a safety net so the session light converges even if a realtime event is missed.
  return useQuery({
    queryKey: accountsQueryKey,
    queryFn: listAccounts,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
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

export function useReactivate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: reactivateSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQueryKey }),
  })
}

export function useKillSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: killSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQueryKey }),
  })
}
