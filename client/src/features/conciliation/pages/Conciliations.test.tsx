import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { conciliationHandlers } from '../../../../tests/msw/handlers/conciliation'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Conciliations } from './Conciliations'

function setReconcileMode() {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json({
        id: 'u-1',
        email: 'test@x',
        name: 'T',
        operation_mode: 'reconcile',
      })
    )
  )
}

function setPassthroughMode() {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json({
        id: 'u-1',
        email: 'test@x',
        name: 'T',
        operation_mode: 'passthrough',
      })
    )
  )
}

const baseRow = {
  id: 'c-1',
  accountId: 'a-1',
  externalId: 'ord-1',
  expectedAmount: 100,
  currency: 'ARS',
  senderName: 'Alice',
  status: 'pending',
  retryCount: 0,
  lastCheckedAt: null,
  createdAt: '2026-05-17T10:00:00Z',
  bank: 'mi-dinero',
  accountName: 'Cuenta 1',
}

describe('Conciliations page', () => {
  beforeEach(() => {
    setReconcileMode()
    server.use(...accountHandlers, ...conciliationHandlers)
  })

  it('renders conciliation rows from the API', async () => {
    renderWithProviders(<Conciliations />)
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
    })
  })

  it('renders the wrong-mode notice for passthrough users', async () => {
    setPassthroughMode()
    renderWithProviders(<Conciliations />)
    await waitFor(() => {
      expect(
        screen.getByText(/Tu cuenta opera en modo Notificación directa/i)
      ).toBeInTheDocument()
    })
  })

  it('renders the empty-state row when there are no requests', async () => {
    server.use(http.get('/api/conciliation', () => HttpResponse.json([])))
    renderWithProviders(<Conciliations />)
    await waitFor(() => {
      expect(screen.getByText('Aún no hay órdenes')).toBeInTheDocument()
    })
  })

  it('filters rows by free-text search', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseRow, id: 'c-1', externalId: 'ord-1', senderName: 'Alice' },
          { ...baseRow, id: 'c-2', externalId: 'ord-2', senderName: 'Bob' },
        ])
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
      expect(screen.getByText('ord-2')).toBeInTheDocument()
    })

    const search = screen.getByPlaceholderText(/Buscar por ID, remitente, monto/i)
    await user.type(search, 'Bob')

    await waitFor(() => {
      expect(screen.queryByText('ord-1')).not.toBeInTheDocument()
      expect(screen.getByText('ord-2')).toBeInTheDocument()
    })

    // Clear button (X) inside the search.
    const clear = search.parentElement?.querySelector('button')
    expect(clear).not.toBeNull()
    await user.click(clear!)
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
    })
  })

  it('applies the status filter from the filters dialog', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseRow, id: 'c-1', externalId: 'ord-1', status: 'pending' },
          { ...baseRow, id: 'c-2', externalId: 'ord-2', status: 'matched' },
        ])
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Filtros/i }))
    const dialog = await screen.findByRole('dialog')

    // Open status select and pick "Conciliado".
    const trigger = within(dialog).getByRole('combobox')
    await user.click(trigger)
    const option = await screen.findByRole('option', { name: /^Conciliado$/i })
    await user.click(option)

    // Apply.
    await user.click(within(dialog).getByRole('button', { name: /Aplicar/i }))

    await waitFor(() => {
      expect(screen.queryByText('ord-1')).not.toBeInTheDocument()
      expect(screen.getByText('ord-2')).toBeInTheDocument()
    })
  })

  it('clears all filters via the Limpiar button', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseRow, id: 'c-1', externalId: 'ord-1', status: 'pending' },
          { ...baseRow, id: 'c-2', externalId: 'ord-2', status: 'matched' },
        ])
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Filtros/i }))
    let dialog = await screen.findByRole('dialog')
    const trigger = within(dialog).getByRole('combobox')
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: /^Conciliado$/i }))
    await user.click(within(dialog).getByRole('button', { name: /Aplicar/i }))

    await waitFor(() => {
      expect(screen.queryByText('ord-1')).not.toBeInTheDocument()
    })

    // Re-open filters → Limpiar should be visible.
    await user.click(screen.getByRole('button', { name: /Filtros/i }))
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Limpiar/i }))
    await user.click(within(dialog).getByRole('button', { name: /Aplicar/i }))

    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
    })
  })

  it('filters by dateFrom/dateTo when set', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseRow, id: 'c-1', externalId: 'ord-old', createdAt: '2024-01-01T00:00:00Z' },
          { ...baseRow, id: 'c-2', externalId: 'ord-recent', createdAt: '2026-05-17T10:00:00Z' },
        ])
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-recent')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Filtros/i }))
    const dialog = await screen.findByRole('dialog')

    const inputs = within(dialog).getAllByDisplayValue('') as HTMLInputElement[]
    const dateInputs = inputs.filter(i => i.type === 'date')
    expect(dateInputs.length).toBe(2)
    await user.type(dateInputs[0], '2026-01-01')
    await user.type(dateInputs[1], '2026-12-31')

    await user.click(within(dialog).getByRole('button', { name: /Aplicar/i }))
    await waitFor(() => {
      expect(screen.queryByText('ord-old')).not.toBeInTheDocument()
      expect(screen.getByText('ord-recent')).toBeInTheDocument()
    })
  })

  it('renders the renotify button only for notifiable statuses', async () => {
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseRow, id: 'c-1', externalId: 'ord-1', status: 'pending' },
          { ...baseRow, id: 'c-2', externalId: 'ord-2', status: 'matched' },
        ])
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
      expect(screen.getByText('ord-2')).toBeInTheDocument()
    })

    // Should be 1 disabled bell (pending row) and 1 enabled bell trigger (matched row).
    const bellButtons = screen.getAllByRole('button').filter(b => b.querySelector('.lucide-bell'))
    const disabled = bellButtons.filter(b => (b as HTMLButtonElement).disabled)
    const enabled = bellButtons.filter(b => !(b as HTMLButtonElement).disabled)
    expect(disabled.length).toBeGreaterThan(0)
    expect(enabled.length).toBeGreaterThan(0)
  })

  it('triggers the notify endpoint when the renotify dialog is confirmed', async () => {
    const user = userEvent.setup()
    let notifyCalls = 0
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseRow, id: 'c-1', externalId: 'ord-1', status: 'matched' },
        ])
      ),
      http.post('/api/conciliation/:requestId/notify', () => {
        notifyCalls += 1
        return HttpResponse.json({ queued: true })
      })
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())

    const bell = screen.getAllByRole('button').find(b => b.querySelector('.lucide-bell') && !(b as HTMLButtonElement).disabled)!
    await user.click(bell)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^Notificar$/i }))
    await waitFor(() => expect(notifyCalls).toBe(1))
  })

  it('clears status and date filters via their per-input X buttons inside the dialog', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Filtros/i }))
    let dialog = await screen.findByRole('dialog')

    // Pick a status.
    const trigger = within(dialog).getByRole('combobox')
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: /^Pendiente$/i }))

    // Fill both dates.
    const inputs = within(dialog).getAllByDisplayValue('') as HTMLInputElement[]
    const dateInputs = inputs.filter(i => i.type === 'date')
    await user.type(dateInputs[0], '2026-01-01')
    await user.type(dateInputs[1], '2026-12-31')

    // Now each input should expose an X button → there are 3 of them (status, dateFrom, dateTo).
    const xButtons = within(dialog).getAllByRole('button').filter(b => b.querySelector('.lucide-x'))
    expect(xButtons.length).toBeGreaterThanOrEqual(3)
    for (const btn of xButtons.slice(0, 3)) {
      await user.click(btn)
    }

    // Apply with everything cleared → list should remain visible.
    await user.click(within(dialog).getByRole('button', { name: /Aplicar/i }))
    await waitFor(() => {
      expect(screen.getByText('ord-1')).toBeInTheDocument()
    })
    // Re-open and confirm the draft inputs are empty (status cleared).
    await user.click(screen.getByRole('button', { name: /Filtros/i }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('combobox').textContent).toContain('Todos los estados')
  })

  it('switches to a per-account tab and filters rows to that account', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())

    const accountTab = screen.getByRole('tab', { name: /Cuenta 1/i })
    await user.click(accountTab)
    // Row should still be visible since it belongs to a-1.
    expect(screen.getByText('ord-1')).toBeInTheDocument()
  })

  it('renders fallback dashes and bank labels for unknown account, null sender, and an unmapped status', async () => {
    server.use(
      // Account has null name → CardTitle/tab/label fallback to bank.
      http.get('/api/accounts', () =>
        HttpResponse.json([
          { id: 'a-1', bank: 'mi-dinero', name: null, status: 'active' },
        ])
      ),
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          // Unknown accountId → accountMap[..] ?? '—'
          // Null senderName → r.senderName ?? '—'
          // Status not in statusStyle map → style?.className ?? ''
          { ...baseRow, id: 'c-x', externalId: 'ord-x', accountId: 'a-unknown', senderName: null, status: 'unknown-status' },
        ])
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-x')).toBeInTheDocument())
    // Two dashes rendered (account name + sender)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    // The per-account tab/card uses the bank code because name is null.
    expect(screen.getAllByText('mi-dinero').length).toBeGreaterThan(0)
  })

  it('renders the empty state inside a per-account tab (showAccount=false → colSpan 7)', async () => {
    const user = userEvent.setup()
    server.use(
      // No matching rows for account a-1.
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseRow, id: 'c-1', externalId: 'ord-other', accountId: 'a-other' },
        ])
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Cuenta 1/i })).toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: /Cuenta 1/i }))
    // Per-account empty state renders with colSpan=7 (showAccount=false branch).
    await waitFor(() => {
      expect(screen.getAllByText('Aún no hay órdenes').length).toBeGreaterThan(0)
    })
  })

  it('shows the query error state and retries all failing queries', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/conciliation', () => HttpResponse.json({}, { status: 500 })),
      http.get('/api/accounts', () => HttpResponse.json({}, { status: 500 })),
      http.get('/api/me', () => HttpResponse.json({}, { status: 500 }))
    )
    renderWithProviders(<Conciliations />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    // Fix the endpoints and retry.
    setReconcileMode()
    server.use(...accountHandlers, ...conciliationHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())
  })

  it('retries only the conciliation query when it is the only failing one', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/conciliation', () => HttpResponse.json({}, { status: 500 })))
    renderWithProviders(<Conciliations />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    server.use(...conciliationHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())
  })

  it('retries only the accounts query when it is the only failing one', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/accounts', () => HttpResponse.json({}, { status: 500 })))
    renderWithProviders(<Conciliations />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    server.use(...accountHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())
  })

  it('toasts the server message when renotifying fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([{ ...baseRow, id: 'c-1', externalId: 'ord-1', status: 'matched' }])
      ),
      http.post('/api/conciliation/:requestId/notify', () =>
        HttpResponse.json({ error: 'webhook caído' }, { status: 500 })
      )
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())

    const bell = screen.getAllByRole('button').find(b => b.querySelector('.lucide-bell') && !(b as HTMLButtonElement).disabled)!
    await user.click(bell)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^Notificar$/i }))

    expect(await screen.findAllByText('webhook caído')).not.toHaveLength(0)
  })

  it('toasts the fallback messages when renotifying fails without a message', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([{ ...baseRow, id: 'c-1', externalId: 'ord-1', status: 'matched' }])
      ),
      http.post('/api/conciliation/:requestId/notify', () => HttpResponse.json({}, { status: 500 }))
    )
    renderWithProviders(<Conciliations />)
    await waitFor(() => expect(screen.getByText('ord-1')).toBeInTheDocument())

    const bell = screen.getAllByRole('button').find(b => b.querySelector('.lucide-bell') && !(b as HTMLButtonElement).disabled)!
    await user.click(bell)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^Notificar$/i }))

    // Hook-level and dialog-level handlers each toast their own fallback copy.
    expect(await screen.findByText(/No se pudo reenviar la notificación/i)).toBeInTheDocument()
    expect(await screen.findByText(/Algo salió mal/i)).toBeInTheDocument()
  })
})
