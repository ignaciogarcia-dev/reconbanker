import { describe, it, expect, beforeEach } from 'vitest'
import { Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../tests/msw/server'
import { accountHandlers } from '../../../tests/msw/handlers/account'
import { bankingHandlers } from '../../../tests/msw/handlers/banking'
import { userHandlers } from '../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../tests/utils/render'
import { bankingRoutes } from './routes'

describe('bankingRoutes', () => {
  beforeEach(() => {
    server.use(...userHandlers, ...accountHandlers, ...bankingHandlers)
  })

  it('renders the BankMovements page at /movements', async () => {
    renderWithProviders(<Routes>{bankingRoutes}</Routes>, {
      initialEntries: ['/movements'],
    })
    await waitFor(() => {
      expect(screen.getByText('Movimientos bancarios')).toBeInTheDocument()
    })
  })
})
