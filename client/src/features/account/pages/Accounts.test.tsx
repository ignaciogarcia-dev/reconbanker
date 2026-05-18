import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Accounts } from './Accounts'

describe('Accounts page', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('renders the list of accounts from the API', async () => {
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })
  })
})
