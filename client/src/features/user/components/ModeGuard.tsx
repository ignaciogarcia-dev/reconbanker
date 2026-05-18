import { Navigate } from 'react-router-dom'
import { useUser } from '../hooks/useUser'
import type { OperationMode } from '../types'

/**
 * Guards a route by the user's current operation mode. If the user has a
 * mode set and it doesn't match `requires`, redirects to `/`.
 */
export function ModeGuard({
  requires,
  children,
}: {
  requires: OperationMode
  children: React.ReactNode
}) {
  const { data: me, isLoading } = useUser()
  if (isLoading || !me) return null
  if (me.operationMode != null && me.operationMode !== requires) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
