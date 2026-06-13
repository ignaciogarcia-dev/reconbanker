import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { Toaster } from '@/shared/ui/sonner'
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary'
import { localizedApiError } from '@/shared/http/client'
import i18n from '@/shared/i18n'
import { AuthProvider } from '@/features/user/providers/AuthProvider'
import { PublicShell } from '@/shared/layout/PublicShell'
import { ProtectedShell } from '@/shared/layout/ProtectedShell'
import { userPublicRoutes } from '@/features/user/routes'
import { dashboardRoutes } from '@/features/dashboard/routes'
import { accountRoutes } from '@/features/account/routes'
import { bankingRoutes } from '@/features/banking/routes'
import { conciliationRoutes } from '@/features/conciliation/routes'
import { scriptEngineRoutes } from '@/features/script-engine/routes'
// Fallback toast for mutations that declare no local onError so failures are never silent.
// Exported so tests can exercise the cache-level fallback directly.
// eslint-disable-next-line react-refresh/only-export-components
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      // meta.errorHandled marks hooks whose callers pass onError to mutate() which the cache cannot see
      if (mutation.options.onError || mutation.meta?.errorHandled) return
      toast.error(localizedApiError(error) ?? i18n.t('errors.generic'))
    },
  }),
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <BrowserRouter>
            <ErrorBoundary>
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
            </ErrorBoundary>
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
