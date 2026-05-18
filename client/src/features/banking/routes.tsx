import { Route } from 'react-router-dom'
import { ModeGuard } from '@/features/user/components/ModeGuard'
import { BankMovements } from './pages/BankMovements'

export const bankingRoutes = (
  <>
    <Route
      path="/movements"
      element={
        <ModeGuard requires="passthrough">
          <BankMovements />
        </ModeGuard>
      }
    />
  </>
)
