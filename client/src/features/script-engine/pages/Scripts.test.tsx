import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { scriptEngineHandlers } from '../../../../tests/msw/handlers/scriptEngine'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Scripts } from './Scripts'

describe('Scripts page', () => {
  beforeEach(() => {
    server.use(...accountHandlers, ...scriptEngineHandlers)
  })

  it('renders active scripts by default', async () => {
    renderWithProviders(<Scripts />)
    await waitFor(() => {
      expect(screen.getByText('2.0.1')).toBeInTheDocument()
      expect(screen.getByText('Activo')).toBeInTheDocument()
    })
    expect(screen.queryByText('Obsoleto')).not.toBeInTheDocument()
  })

  it('shows all scripts when the all tab is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Scripts />)

    await waitFor(() => {
      expect(screen.getByText('2.0.1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: 'Todos' }))

    await waitFor(() => {
      expect(screen.getByText('2.0.0')).toBeInTheDocument()
      expect(screen.getByText('Obsoleto')).toBeInTheDocument()
    })
  })

  it('renders the empty-state row when there are no active scripts', async () => {
    server.use(http.get('/api/scripts', () => HttpResponse.json([])))
    renderWithProviders(<Scripts />)
    await waitFor(() => {
      expect(screen.getByText('No hay scripts activos')).toBeInTheDocument()
    })
  })

  it('renders the all-tab empty state when there are no scripts at all', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/scripts', () => HttpResponse.json([])))
    renderWithProviders(<Scripts />)
    await waitFor(() => {
      expect(screen.getByText('No hay scripts activos')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: 'Todos' }))
    await waitFor(() => {
      expect(screen.getByText('No hay scripts registrados')).toBeInTheDocument()
    })
  })

  it('renders the bank name from the banks lookup when available', async () => {
    renderWithProviders(<Scripts />)
    await waitFor(() => {
      // accountHandlers seeds bank code "mi-dinero" → name "Mi Dinero".
      expect(screen.getByText('Mi Dinero')).toBeInTheDocument()
    })
  })

  it('renders the Promover button for scripts in review status and triggers promote', async () => {
    const user = userEvent.setup()
    let promoteCalls = 0
    server.use(
      http.get('/api/scripts', () =>
        HttpResponse.json([
          {
            id: 's-9',
            bank: 'mi-dinero',
            flowType: 'extract_transactions',
            version: '3.0.0',
            status: 'review',
            origin: 'system',
            createdAt: '2026-05-17T10:00:00Z',
          },
        ])
      ),
      http.post('/api/scripts/s-9/promote', () => {
        promoteCalls += 1
        return HttpResponse.json({ ok: true })
      })
    )
    const user2 = user
    renderWithProviders(<Scripts />)
    // The review-status script isn't active, so we need to switch to "Todos".
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
    })
    await user2.click(screen.getByRole('tab', { name: 'Todos' }))
    await waitFor(() => {
      expect(screen.getByText('3.0.0')).toBeInTheDocument()
    })

    await user2.click(screen.getByRole('button', { name: /Promover/i }))
    await waitFor(() => expect(promoteCalls).toBe(1))
  })

  it('falls back to the outline badge variant for an unknown script status', async () => {
    server.use(
      http.get('/api/scripts', () =>
        HttpResponse.json([
          {
            id: 's-x',
            bank: 'mi-dinero',
            flowType: 'extract_transactions',
            version: '9.9.9',
            // Not in statusVariant map → triggers the `?? 'outline'` fallback.
            status: 'mystery',
            origin: 'system',
            createdAt: '2026-05-17T10:00:00Z',
          },
        ])
      )
    )
    const user = userEvent.setup()
    renderWithProviders(<Scripts />)
    // Mystery isn't 'active', so switch to "Todos" to see it.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: 'Todos' }))
    await waitFor(() => {
      expect(screen.getByText('9.9.9')).toBeInTheDocument()
    })
  })

  it('falls back to the script.bank code when no bank name is found', async () => {
    server.use(
      http.get('/api/banks', () => HttpResponse.json([])),
      http.get('/api/scripts', () =>
        HttpResponse.json([
          {
            id: 's-7',
            bank: 'unknown-code',
            flowType: 'extract_transactions',
            version: '1.0.0',
            status: 'active',
            origin: 'system',
            createdAt: '2026-05-17T10:00:00Z',
          },
        ])
      )
    )
    renderWithProviders(<Scripts />)
    await waitFor(() => {
      expect(screen.getByText('unknown-code')).toBeInTheDocument()
    })
  })
})
