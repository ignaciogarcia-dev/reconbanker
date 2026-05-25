import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Banks } from './Banks'

describe('Banks page', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('renders the loading hint while the request is in flight', () => {
    renderWithProviders(<Banks />)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders the list of banks once the request resolves', async () => {
    renderWithProviders(<Banks />)
    await waitFor(() => {
      expect(screen.getByText('Mi Dinero')).toBeInTheDocument()
    })
    expect(screen.getByText('mi-dinero')).toBeInTheDocument()
    expect(screen.getByText('Listo')).toBeInTheDocument()
  })

  it('renders the empty-state row when the API returns no banks', async () => {
    server.use(http.get('/api/banks', () => HttpResponse.json([])))
    renderWithProviders(<Banks />)
    await waitFor(() => {
      expect(screen.getByText('No hay bancos registrados')).toBeInTheDocument()
    })
  })

  it('falls back to the outline badge variant for an unknown status', async () => {
    server.use(
      http.get('/api/banks', () =>
        HttpResponse.json([
          {
            id: 'b-x',
            code: 'unknown-bank',
            name: 'Unknown Bank',
            loginUrl: null,
            // status not in statusVariant map → tests the `?? 'outline'` fallback.
            status: 'mystery',
          },
        ])
      )
    )
    renderWithProviders(<Banks />)
    await waitFor(() => {
      expect(screen.getByText('Unknown Bank')).toBeInTheDocument()
    })
  })
})
