import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAccountConfig, upsertAccountConfig } from '../api/accountConfig'
import type { UpsertAccountConfigInput } from '../types'

export const accountConfigQueryKey = (accountId: string | undefined) => ['account-config', accountId] as const

export function useAccountConfig(accountId: string | undefined) {
  return useQuery({
    queryKey: accountConfigQueryKey(accountId),
    queryFn: () => getAccountConfig(accountId!),
    enabled: !!accountId,
  })
}

export function useUpsertAccountConfig(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertAccountConfigInput) => upsertAccountConfig(accountId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountConfigQueryKey(accountId) }),
  })
}
