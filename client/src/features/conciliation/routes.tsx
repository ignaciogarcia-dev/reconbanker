import { Route } from 'react-router-dom'
import { ModeGuard } from '@/features/user/components/ModeGuard'
import { Conciliations } from './pages/Conciliations'

export const conciliationRoutes = (
  <>
    <Route
      path="/conciliations"
      element={
        <ModeGuard requires="reconcile">
          <Conciliations />
        </ModeGuard>
      }
    />
  </>
)
