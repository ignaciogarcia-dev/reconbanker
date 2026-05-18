import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/user/hooks/useAuth'

export function PublicShell() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
