import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../tests/msw/server'
import { accountHandlers } from '../../../tests/msw/handlers/account'
import { conciliationHandlers } from '../../../tests/msw/handlers/conciliation'
import { renderWithProviders } from '../../../tests/utils/render'
import { conciliationRoutes } from './routes'

describe('conciliationRoutes', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/me', () =>
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

  it('renders Conciliations at /conciliations when in reconcile mode', async () => {
    renderWithProviders(<Routes>{conciliationRoutes}</Routes>, {
      initialEntries: ['/conciliations'],
    })
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
    })
  })
})
