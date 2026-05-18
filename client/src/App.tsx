import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { Toaster } from '@/shared/ui/sonner'
import { AuthProvider } from '@/features/user/providers/AuthProvider'
import { useAuth } from '@/features/user/hooks/useAuth'
import { AppLayout } from '@/shared/layout/AppLayout'
import { Login } from '@/features/user/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Banks } from '@/features/account/pages/Banks'
import { Accounts } from '@/features/account/pages/Accounts'
import { AccountConfig } from '@/features/account/pages/AccountConfig'
import { Conciliations } from '@/features/conciliation/pages/Conciliations'
import { BankMovements } from '@/features/banking/pages/BankMovements'
import { Scripts } from '@/pages/Scripts'
import { Register } from '@/features/user/pages/Register'
import { useUser } from '@/features/user/hooks/useUser'
import type { OperationMode } from '@/features/user/types'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function ModeGuard({ requires, children }: { requires: OperationMode; children: React.ReactNode }) {
  const { data: me, isLoading } = useUser()
  if (isLoading || !me) return null
  if (me.operationMode != null && me.operationMode !== requires) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/"                              element={<Dashboard />} />
        <Route path="/banks"                         element={<Banks />} />
        <Route path="/accounts"                      element={<Accounts />} />
        <Route path="/accounts/:accountId/config"    element={<AccountConfig />} />
        <Route path="/conciliations"                 element={<ModeGuard requires="reconcile"><Conciliations /></ModeGuard>} />
        <Route path="/movements"                     element={<ModeGuard requires="passthrough"><BankMovements /></ModeGuard>} />
        <Route path="/scripts"                       element={<Scripts />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
