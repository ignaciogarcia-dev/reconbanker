import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('renders the no-accounts empty state when the user has no accounts', async () => {
    server.use(http.get('/api/accounts', () => HttpResponse.json([])))
    renderWithProviders(<BankMovements />)
    await waitFor(() => {
      expect(
        screen.getByText(/No tenés cuentas configuradas/i)
      ).toBeInTheDocument()
    })
  })

  it('renders the per-account empty-table state when there are no movements', async () => {
    server.use(
      http.get('/api/accounts/:accountId/movements', () => HttpResponse.json([]))
    )
    renderWithProviders(<BankMovements />)
    await waitFor(() => {
      expect(screen.getByText('Aún no hay movimientos')).toBeInTheDocument()
    })
  })

  it('renders the "Sí" (notified) badge for movements that have notifiedAt', async () => {
    server.use(
      http.get('/api/accounts/:accountId/movements', () =>
        HttpResponse.json([
          {
            id: 'm-1',
            externalId: 'ext-2',
            amount: 200,
            currency: 'ARS',
            senderName: null,
            receivedAt: '2026-05-17T10:00:00Z',
            notifiedAt: '2026-05-17T11:00:00Z',
            excludedAt: null,
          },
        ])
      )
    )
    renderWithProviders(<BankMovements />)
    await waitFor(() => {
      expect(screen.getByText('ext-2')).toBeInTheDocument()
    })
    expect(screen.getByText('Sí')).toBeInTheDocument()
    // senderName null → "—" fallback rendered in the table.
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('falls back to the bank code when the account has no name', async () => {
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([
          { id: 'a-1', bank: 'fallback-bank', name: null, status: 'active' },
        ])
      ),
      http.get('/api/accounts/:accountId/movements', () => HttpResponse.json([]))
    )
    renderWithProviders(<BankMovements />)
    await waitFor(() => {
      // Bank code should appear in both the tab label and the card title.
      const matches = screen.getAllByText('fallback-bank')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('triggers the renotify endpoint when the confirm button is clicked', async () => {
    const user = userEvent.setup()
    let notifyCalls = 0
    server.use(
      http.post('/api/accounts/:accountId/movements/:movementId/notify', () => {
        notifyCalls += 1
        return HttpResponse.json({ queued: true })
      })
    )
    renderWithProviders(<BankMovements />)
    await waitFor(() => {
      expect(screen.getByText('ext-1')).toBeInTheDocument()
    })

    // Open the dialog from the row action.
    const bellTriggers = screen.getAllByRole('button').filter(b => b.querySelector('.lucide-bell'))
    expect(bellTriggers.length).toBeGreaterThan(0)
    await user.click(bellTriggers[0])

    const dialog = await screen.findByRole('dialog')
    const confirmBtn = within(dialog).getByRole('button', { name: 'Notificar' })
    await user.click(confirmBtn)

    await waitFor(() => expect(notifyCalls).toBe(1))
  })

  it('shows the query error state with a retry button when the accounts query fails', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/accounts', () => HttpResponse.json({}, { status: 500 })))
    renderWithProviders(<BankMovements />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    // Fix the endpoint and retry.
    server.use(...accountHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => expect(screen.getByText('ext-1')).toBeInTheDocument())
  })

  it('shows the query error state when loading the movements of an account fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts/:accountId/movements', () => HttpResponse.json({}, { status: 500 }))
    )
    renderWithProviders(<BankMovements />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    // Fix the endpoint and retry.
    server.use(...bankingHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => expect(screen.getByText('ext-1')).toBeInTheDocument())
  })

  it('toasts the server message when renotifying fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/accounts/:accountId/movements/:movementId/notify', () =>
        HttpResponse.json({ error: 'webhook caído' }, { status: 500 })
      )
    )
    renderWithProviders(<BankMovements />)
    await waitFor(() => expect(screen.getByText('ext-1')).toBeInTheDocument())

    const bellTriggers = screen.getAllByRole('button').filter(b => b.querySelector('.lucide-bell'))
    await user.click(bellTriggers[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Notificar' }))

    expect(await screen.findAllByText('webhook caído')).not.toHaveLength(0)
  })

  it('toasts the fallback messages when renotifying fails without a message', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/accounts/:accountId/movements/:movementId/notify', () =>
        HttpResponse.json({}, { status: 500 })
      )
    )
    renderWithProviders(<BankMovements />)
    await waitFor(() => expect(screen.getByText('ext-1')).toBeInTheDocument())

    const bellTriggers = screen.getAllByRole('button').filter(b => b.querySelector('.lucide-bell'))
    await user.click(bellTriggers[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Notificar' }))

    // Hook-level and page-level handlers each toast their own fallback copy.
    expect(await screen.findByText(/No se pudo reenviar la notificación/i)).toBeInTheDocument()
    expect(await screen.findByText(/Algo salió mal/i)).toBeInTheDocument()
  })
})
