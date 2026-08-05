import { Route } from 'react-router'
import { BankMovements } from './pages/BankMovements'

export const bankingRoutes = (
  <>
    <Route path="/movements" element={<BankMovements />} />
  </>
)
