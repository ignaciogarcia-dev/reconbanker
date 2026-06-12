import { toast } from 'sonner'
import { localizedApiError } from '@/shared/http/client'
import i18n from '@/shared/i18n'
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
    onError: (err) => toast.error(localizedApiError(err) ?? i18n.t('script-engine:scripts.promoteError')),
  })
}
