import { describe, it, expect, beforeEach } from 'vitest'
import { Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../tests/msw/server'
import { accountHandlers } from '../../../tests/msw/handlers/account'
import { userHandlers } from '../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../tests/utils/render'
import { accountRoutes } from './routes'

describe('accountRoutes', () => {
  beforeEach(() => {
    server.use(...accountHandlers, ...userHandlers)
  })

  it('renders the Accounts page at /accounts', async () => {
    renderWithProviders(<Routes>{accountRoutes}</Routes>, {
      initialEntries: ['/accounts'],
    })
    await waitFor(() => {
      expect(screen.getByText('Cuentas registradas')).toBeInTheDocument()
    })
  })

  it('renders the AccountConfig page at /accounts/:accountId/config', async () => {
    renderWithProviders(<Routes>{accountRoutes}</Routes>, {
      initialEntries: ['/accounts/a-1/config'],
    })
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
  })

  it('renders the Banks page at /banks', async () => {
    renderWithProviders(<Routes>{accountRoutes}</Routes>, {
      initialEntries: ['/banks'],
    })
    await waitFor(() => {
      expect(screen.getByText('Bancos registrados')).toBeInTheDocument()
    })
  })
})
