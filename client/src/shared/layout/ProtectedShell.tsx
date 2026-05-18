import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/user/hooks/useAuth'
import { AppLayout } from './AppLayout'

// NOTE: AppLayout currently renders its own <Outlet />, so ProtectedShell
// simply gates on auth and delegates to it. Task 9 will refactor AppLayout
// to accept children and use <Outlet /> here instead.
export function ProtectedShell() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout />
}
