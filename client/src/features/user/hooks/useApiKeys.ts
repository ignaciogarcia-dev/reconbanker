import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listApiKeys, createApiKey, revokeApiKey } from '../api/apiKeys'

export const apiKeysQueryKey = ['api-keys'] as const

export function useApiKeys() {
  return useQuery({ queryKey: apiKeysQueryKey, queryFn: listApiKeys })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createApiKey,
    meta: { errorHandled: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysQueryKey }),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysQueryKey }),
  })
}
