import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { conciliationHandlers } from '../../../../tests/msw/handlers/conciliation'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Conciliations } from './Conciliations'

describe('Conciliations page', () => {
  beforeEach(() => {
    // Conciliations only renders when the user is in `reconcile` mode.
    server.use(
      http.get('http://localhost:3000/me', () =>
        HttpResponse.json({
          id: 'u-1',
          email: 'test@x',
          name: 'T',
          operation_mode: 'reconcile',
        })
      ),
      ...accountHandlers,
      ...conciliationHandlers
    )
  })

  it('renders conciliation rows from the API', async () => {
    renderWithProviders(<Conciliations />)
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
    })
  })
})
