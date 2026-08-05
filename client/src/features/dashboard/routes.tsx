import { Route } from 'react-router'
import { Dashboard } from './pages/Dashboard'

export const dashboardRoutes = (
  <>
    <Route path="/" element={<Dashboard />} />
  </>
)
