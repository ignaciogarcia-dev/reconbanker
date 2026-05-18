import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listScripts, promoteScript } from '../api/scripts'

export const scriptsQueryKey = ['scripts'] as const

export function useScripts() {
  return useQuery({ queryKey: scriptsQueryKey, queryFn: listScripts })
}

export function usePromoteScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: promoteScript,
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptsQueryKey }),
  })
}
