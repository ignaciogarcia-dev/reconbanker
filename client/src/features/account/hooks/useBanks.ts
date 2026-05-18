import { useQuery } from '@tanstack/react-query'
import { listBanks } from '../api/banks'

export const banksQueryKey = ['banks'] as const

export function useBanks() {
  return useQuery({ queryKey: banksQueryKey, queryFn: listBanks })
}
