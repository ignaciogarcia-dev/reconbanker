import { Route } from 'react-router-dom'
import { BankMovements } from './pages/BankMovements'

export const bankingRoutes = (
  <>
    <Route path="/movements" element={<BankMovements />} />
  </>
)
