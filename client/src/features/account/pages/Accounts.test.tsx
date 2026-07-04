import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { renderWithProviders } from '../../../../tests/utils/render'
import type { PendingAssistance } from '@/shared/realtime/useRealtime'
import type { SessionStatus } from '../types'
import { Accounts } from './Accounts'

// Drive the realtime assistance/session state directly so the OTP, reactivate and kill branches are
// deterministic. Reconbanker's OTP flow is phase-less: PendingAssistance carries no `phase`, and the
// modal self-clears the account via `onSubmitted` on a successful submit.
const realtimeState: {
  assistance: Map<string, PendingAssistance>
  sessionStatus: Map<string, SessionStatus>
  starting: Set<string>
} = { assistance: new Map(), sessionStatus: new Map(), starting: new Set() }
const clearAccount = vi.fn()
const markStarting = vi.fn()
const clearStarting = vi.fn()
vi.mock('@/shared/realtime/useRealtime', () => ({
  useRealtime: () => ({
    assistance: realtimeState.assistance,
    clearAccount,
    sessionStatus: realtimeState.sessionStatus,
    starting: realtimeState.starting,
    markStarting,
    clearStarting,
  }),
}))

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

describe('Accounts page', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
    realtimeState.assistance = new Map()
    realtimeState.sessionStatus = new Map()
    realtimeState.starting = new Set()
    clearAccount.mockClear()
    markStarting.mockClear()
    clearStarting.mockClear()
  })

  it('surfaces the OTP assistance prompt and closes the modal on cancel', async () => {
    const user = userEvent.setup()
    realtimeState.assistance = new Map([['a-1', { descriptor: { length: 6, type: 'numeric' } }]])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Asistencia requerida/i }))
    expect(await screen.findByText('Ingresar código SMS')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByText('Ingresar código SMS')).not.toBeInTheDocument())
  })

  it('clears the account assistance after a successful OTP submission', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/accounts/a-1/otp', () => new HttpResponse(null, { status: 202 })))
    realtimeState.assistance = new Map([['a-1', { descriptor: { length: 6, type: 'numeric' } }]])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Asistencia requerida/i }))
    await screen.findByText('Ingresar código SMS')

    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    await user.type(boxes[0], '123456')
    // Phase-less OTP: the modal's onSubmitted callback clears the account on a successful submit.
    await waitFor(() => expect(clearAccount).toHaveBeenCalledWith('a-1'))
  })

  it('auto-closes the OTP modal when the assistance request resolves', async () => {
    const user = userEvent.setup()
    realtimeState.assistance = new Map([['a-1', { descriptor: { length: 6, type: 'numeric' } }]])

    // A parent that can force a re-render lets us flip the realtime state after the modal is open.
    function Wrapper() {
      const [, force] = useState(0)
      return (
        <>
          <button onClick={() => force((n) => n + 1)}>force</button>
          <Accounts />
        </>
      )
    }
    renderWithProviders(<Wrapper />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Asistencia requerida/i }))
    expect(await screen.findByText('Ingresar código SMS')).toBeInTheDocument()

    // The server fulfilled the request: the assistance entry is gone, so the modal unmounts.
    realtimeState.assistance = new Map()
    await user.click(screen.getByText('force'))
    await waitFor(() => expect(screen.queryByText('Ingresar código SMS')).not.toBeInTheDocument())
  })

  it('shows the reactivating label while a needs_attention reactivation is pending', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/reactivate', async () => { await delay(50); return HttpResponse.json({ queued: true }) }),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'needs_attention']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /Reactivar/i }))
    // While the POST is in flight the button reflects the pending reactivation.
    expect(await screen.findByRole('button', { name: /Reactivando/i })).toBeInTheDocument()
  })

  it('shows the starting label while a non-attention start is pending', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/reactivate', async () => { await delay(50); return HttpResponse.json({ queued: true }) }),
    )
    // No live status and no account status → liveStatus is nullish, so the button is the "start" variant.
    realtimeState.sessionStatus = new Map()
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /Iniciar/i }))
    expect(await screen.findByRole('button', { name: /Iniciando/i })).toBeInTheDocument()
  })

  it('renders the list of accounts from the API', async () => {
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })
  })

  it('shows the Reactivate button on needs_attention and POSTs to the reactivate endpoint', async () => {
    const user = userEvent.setup()
    let reactivated = false
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/reactivate', () => {
        reactivated = true
        return HttpResponse.json({ queued: true })
      }),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'needs_attention']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    const btn = await screen.findByRole('button', { name: /Reactivar/i })
    await user.click(btn)
    await waitFor(() => expect(reactivated).toBe(true))
  })

  it('toasts the server message when reactivation fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/reactivate', () =>
        HttpResponse.json({ error: 'reactivación rechazada' }, { status: 500 }),
      ),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'needs_attention']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /Reactivar/i }))
    expect(await screen.findByText('reactivación rechazada')).toBeInTheDocument()
  })

  it('toasts the localized fallback when reactivation fails without a message', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/reactivate', () => HttpResponse.json({}, { status: 500 })),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'needs_attention']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /Reactivar/i }))
    expect(await screen.findByText(/No se pudo reactivar la sesión/i)).toBeInTheDocument()
  })

  it('marks the account starting when a reactivation is triggered', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/reactivate', () => HttpResponse.json({ started: true })),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'needs_attention']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /Reactivar/i }))
    expect(markStarting).toHaveBeenCalledWith('a-1')
  })

  it('shows the connecting light and hides the start button while starting', async () => {
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
    )
    realtimeState.starting = new Set(['a-1'])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    expect(screen.getByLabelText('Conectando…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Iniciar|Reactivar/i })).not.toBeInTheDocument()
  })

  it('shows a Start button for an off assisted persistent account', async () => {
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
    )
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /Iniciar/i })).toBeInTheDocument()
  })

  it('opens the New Account dialog when the trigger is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // The dialog has its own title "Nueva cuenta" inside, the trigger button also says that.
    // Look for the description copy which is unique to the dialog.
    expect(
      screen.getByText(/Asociá un banco a una etiqueta/i)
    ).toBeInTheDocument()
  })

  it('shows validation errors when Create is clicked on an empty form', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    // Required + bankRequired messages from i18n (Spanish defaults).
    await waitFor(() => {
      expect(screen.getByText(/Requerido/i)).toBeInTheDocument()
      expect(screen.getByText(/Elegí uno/i)).toBeInTheDocument()
    })
  })

  it('clears the name error as the user types into the field after a submit attempt', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(screen.getByText(/Requerido/i)).toBeInTheDocument()
    })

    const nameInput = screen.getByPlaceholderText(/ej: Cuenta principal/i)
    await user.type(nameInput, 'New name')

    await waitFor(() => {
      expect(screen.queryByText(/Requerido/i)).not.toBeInTheDocument()
    })
  })

  it('renders the empty-state row when there are no accounts', async () => {
    server.use(http.get('/api/accounts', () => HttpResponse.json([])))
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText(/No hay cuentas registradas/i)).toBeInTheDocument()
    })
  })

  it('navigates to the account config page when Configurar is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Routes>
        <Route path="/" element={<><Accounts /><LocationProbe /></>} />
        <Route path="/accounts/:accountId/config" element={<LocationProbe />} />
      </Routes>
    )
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Configurar/i }))
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/accounts/a-1/config')
    })
  })

  it('resets the dialog state when closed without submitting', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')

    const nameInput = screen.getByPlaceholderText(/ej: Cuenta principal/i)
    await user.type(nameInput, 'leftover')
    // Submit to surface errors → opens errors state.
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))
    await waitFor(() => {
      expect(screen.getByText(/Elegí uno/i)).toBeInTheDocument()
    })

    // Close via cancel button.
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Re-open: form should be reset (empty input, no error message).
    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')
    const reopenedInput = screen.getByPlaceholderText(/ej: Cuenta principal/i) as HTMLInputElement
    expect(reopenedInput.value).toBe('')
    expect(screen.queryByText(/Elegí uno/i)).not.toBeInTheDocument()
  })

  it('closes the dialog and resets the form after a successful creation', async () => {
    const user = userEvent.setup()
    // Open list, then trigger create.
    server.use(
      http.post('/api/accounts', () => HttpResponse.json({ id: 'a-99' }, { status: 201 }))
    )
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')

    const nameInput = screen.getByPlaceholderText(/ej: Cuenta principal/i)
    await user.type(nameInput, 'Created via test')

    // Open the bank select and pick Mi Dinero.
    const bankSelect = screen.getByRole('combobox')
    await user.click(bankSelect)
    const option = await screen.findByRole('option', { name: /Mi Dinero/i })
    await user.click(option)

    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('renders the fallback values for null name, unknown bank code, and inactive status', async () => {
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([
          {
            id: 'a-fallbacks',
            bank: 'unknown-bank',
            name: null,
            status: 'inactive',
          },
        ])
      )
    )
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('unknown-bank')).toBeInTheDocument()
    })
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('does not flag errors when typing into a field before any submit attempt', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')
    const nameInput = screen.getByPlaceholderText(/ej: Cuenta principal/i)
    await user.type(nameInput, 'a')
    // No submit yet → no error text should be visible.
    expect(screen.queryByText(/Requerido/i)).not.toBeInTheDocument()
    // Avoid unused-vi-import warning when running in isolation.
    expect(vi).toBeDefined()
  })

  it('shows the query error state with a retry button when the list fails', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/accounts', () => HttpResponse.json({}, { status: 500 })))
    renderWithProviders(<Accounts />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    // Fix the endpoint and retry.
    server.use(...accountHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => {
      expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    })
  })

  it('toasts the server message when creating an account fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/accounts', () =>
        HttpResponse.json({ error: 'banco rechazado' }, { status: 500 })
      )
    )
    renderWithProviders(<Accounts />)
    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')
    await user.type(screen.getByPlaceholderText(/ej: Cuenta principal/i), 'Fallida')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /Mi Dinero/i }))
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    expect(await screen.findByText('banco rechazado')).toBeInTheDocument()
  })

  it('toasts the generic error when creating an account fails without a message', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/accounts', () => HttpResponse.json({}, { status: 500 })))
    renderWithProviders(<Accounts />)
    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Nueva cuenta/i }))
    await screen.findByRole('dialog')
    await user.type(screen.getByPlaceholderText(/ej: Cuenta principal/i), 'Fallida')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /Mi Dinero/i }))
    await user.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    expect(await screen.findByText(/Algo salió mal/i)).toBeInTheDocument()
  })

  it('shows the Kill button on a running session and POSTs after confirming', async () => {
    const user = userEvent.setup()
    let killed = false
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/kill', () => { killed = true; return HttpResponse.json({ killed: true }) }),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'running']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Detener/i }))
    // Confirm dialog appears; confirm it.
    await user.click(await screen.findByRole('button', { name: 'Detener sesión' }))
    await waitFor(() => expect(killed).toBe(true))
  })

  it('shows the killing label while the kill request is pending', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      // Hold the response open long enough for the pending label to be observable before the
      // dialog unmounts on success (the confirm button disappears, not just relabels).
      http.post('/api/accounts/a-1/kill', async () => { await delay(300); return HttpResponse.json({ killed: true }) }),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'running']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Detener/i }))
    await user.click(await screen.findByRole('button', { name: 'Detener sesión' }))
    // While the POST is in flight the confirm button reflects the pending kill.
    expect(await screen.findByRole('button', { name: 'Deteniendo…' })).toBeInTheDocument()
  })

  it('does not POST when the kill confirm is cancelled', async () => {
    const user = userEvent.setup()
    let killed = false
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/kill', () => { killed = true; return HttpResponse.json({ killed: true }) }),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'running']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Detener/i }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByText('Detener sesión')).not.toBeInTheDocument())
    expect(killed).toBe(false)
  })

  it('toasts the server message when kill fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/kill', () =>
        HttpResponse.json({ error: 'cierre rechazado' }, { status: 500 }),
      ),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'running']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Detener/i }))
    await user.click(await screen.findByRole('button', { name: 'Detener sesión' }))
    expect(await screen.findByText('cierre rechazado')).toBeInTheDocument()
  })

  it('toasts the fallback when kill fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([{ id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active', assistedPersistent: true }]),
      ),
      http.post('/api/accounts/a-1/kill', () => HttpResponse.json({}, { status: 500 })),
    )
    realtimeState.sessionStatus = new Map([['a-1', 'running']])
    renderWithProviders(<Accounts />)

    await waitFor(() => expect(screen.getByText('Cuenta 1')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Detener/i }))
    await user.click(await screen.findByRole('button', { name: 'Detener sesión' }))
    expect(await screen.findByText(/No se pudo detener la sesión/i)).toBeInTheDocument()
  })
})
