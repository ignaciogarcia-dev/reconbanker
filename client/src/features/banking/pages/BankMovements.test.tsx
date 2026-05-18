import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { bankingHandlers } from '../../../../tests/msw/handlers/banking'
import { renderWithProviders } from '../../../../tests/utils/render'
import { BankMovements } from './BankMovements'

describe('BankMovements page', () => {
  beforeEach(() => {
    server.use(...userHandlers, ...accountHandlers, ...bankingHandlers)
  })

  it('renders movements rows from the API', async () => {
    renderWithProviders(<BankMovements />)
    await waitFor(() => {
      expect(screen.getByText('ext-1')).toBeInTheDocument()
    })
  })
})
