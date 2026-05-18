import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { Toaster } from '@/shared/ui/sonner'
import { AuthProvider } from '@/features/user/providers/AuthProvider'
import { PublicShell } from '@/shared/layout/PublicShell'
import { ProtectedShell } from '@/shared/layout/ProtectedShell'
import { userPublicRoutes } from '@/features/user/routes'
import { dashboardRoutes } from '@/features/dashboard/routes'
import { accountRoutes } from '@/features/account/routes'
import { bankingRoutes } from '@/features/banking/routes'
import { conciliationRoutes } from '@/features/conciliation/routes'
import { scriptEngineRoutes } from '@/features/script-engine/routes'
import '@/shared/i18n'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<PublicShell />}>{userPublicRoutes}</Route>
              <Route element={<ProtectedShell />}>
                {dashboardRoutes}
                {accountRoutes}
                {bankingRoutes}
                {conciliationRoutes}
                {scriptEngineRoutes}
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
