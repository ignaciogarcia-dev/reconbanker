import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/me'

export const meQueryKey = ['me'] as const

export function useUser() {
  return useQuery({ queryKey: meQueryKey, queryFn: getMe })
}
