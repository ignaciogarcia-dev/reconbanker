import { describe, it, expect, beforeEach } from 'vitest'
import { Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../tests/msw/server'
import { userHandlers } from '../../../tests/msw/handlers/user'
import { accountHandlers } from '../../../tests/msw/handlers/account'
import { bankingHandlers } from '../../../tests/msw/handlers/banking'
import { conciliationHandlers } from '../../../tests/msw/handlers/conciliation'
import { renderWithProviders } from '../../../tests/utils/render'
import { dashboardRoutes } from './routes'

describe('dashboardRoutes', () => {
  beforeEach(() => {
    server.use(...userHandlers, ...accountHandlers, ...bankingHandlers, ...conciliationHandlers)
  })

  it('renders the Dashboard at /', async () => {
    renderWithProviders(<Routes>{dashboardRoutes}</Routes>, {
      initialEntries: ['/'],
    })
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })
})
