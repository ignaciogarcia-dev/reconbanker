import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/lib/auth'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Banks } from '@/pages/Banks'
import { Accounts } from '@/pages/Accounts'
import { AccountConfig } from '@/pages/AccountConfig'
import { Conciliations } from '@/pages/Conciliations'
import { BankMovements } from '@/pages/BankMovements'
import { Scripts } from '@/pages/Scripts'
import { Register } from '@/pages/Register'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
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
        <Route path="/conciliations"                 element={<Conciliations />} />
        <Route path="/movements"                     element={<BankMovements />} />
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
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
