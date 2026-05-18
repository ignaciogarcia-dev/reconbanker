import { Route } from 'react-router-dom'
import { Accounts } from './pages/Accounts'
import { AccountConfig } from './pages/AccountConfig'
import { Banks } from './pages/Banks'

export const accountRoutes = (
  <>
    <Route path="/accounts" element={<Accounts />} />
    <Route path="/accounts/:accountId/config" element={<AccountConfig />} />
    <Route path="/banks" element={<Banks />} />
  </>
)
