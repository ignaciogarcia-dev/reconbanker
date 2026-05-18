import { Route } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'

export const dashboardRoutes = (
  <>
    <Route path="/" element={<Dashboard />} />
  </>
)
