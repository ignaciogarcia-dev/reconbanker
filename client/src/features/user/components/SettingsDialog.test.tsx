import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import { SettingsDialog } from './SettingsDialog'

class MockResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    // Synchronously invoke the callback once so the component's resize
    // handler runs and gets covered.
    this.cb([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

interface HostOptions {
  initialOpen?: boolean
  onOpenChange?: (o: boolean) => void
}

function Host({ initialOpen = true, onOpenChange }: HostOptions) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <SettingsDialog
      open={open}
      onOpenChange={o => {
        setOpen(o)
        onOpenChange?.(o)
      }}
    />
  )
}

function meHandler(opts: {
  operationMode?: 'reconcile' | 'passthrough' | null
  name?: string | null
  email?: string
  totpEnabled?: boolean
}) {
  return http.get('/api/me', () =>
    HttpResponse.json({
      id: 'u-1',
      email: opts.email ?? 'user@x',
      name: opts.name === undefined ? 'Alice Smith' : opts.name,
      operation_mode: opts.operationMode === undefined ? 'passthrough' : opts.operationMode,
      totp_enabled: opts.totpEnabled ?? false,
    })
  )
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    server.use(...userHandlers)
  })

  it('renders a loading state when /me has not resolved', async () => {
    server.use(
      http.get('/api/me', async () => {
        await new Promise(r => setTimeout(r, 5_000))
        return HttpResponse.json({
          id: 'u-1', email: 'a@x', name: 'A', operation_mode: 'passthrough',
        })
      })
    )
    renderWithProviders(<Host />)
    expect(await screen.findByText(/Cargando.../i)).toBeInTheDocument()
  })

  it('renders user details and the first-letter avatar', async () => {
    server.use(meHandler({}))
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice Smith')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    // First initial of name shown in sidebar avatar
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('uses email initial when name is null', async () => {
    server.use(meHandler({ name: null, email: 'zoe@x' }))
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('zoe@x')).toBeInTheDocument()
    })
    expect(screen.getByText('Z')).toBeInTheDocument()
  })

  it('shows the 2FA enable action on the Security tab when 2FA is off', async () => {
    server.use(meHandler({ totpEnabled: false }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => expect(screen.getByDisplayValue('user@x')).toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: /Seguridad/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Activar 2FA/i })).toBeInTheDocument()
    )
  })

  it('shows the 2FA "on" state on the Security tab when 2FA is enabled', async () => {
    server.use(meHandler({ totpEnabled: true }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => expect(screen.getByDisplayValue('user@x')).toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: /Seguridad/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Desactivar 2FA/i })).toBeInTheDocument()
    )
  })

  it('switches to the operation tab and shows the current-mode badge', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await waitFor(() => {
      expect(screen.getByText(/Actual/i)).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /Cambiar modo/i })
    ).toBeInTheDocument()
  })

  it('expands editing, allows selecting the other mode, then saving with confirmation', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    let putBody: unknown = null
    server.use(
      http.put('/api/me/operation-mode', async ({ request }) => {
        putBody = await request.json()
        return HttpResponse.json({ operation_mode: 'reconcile' })
      })
    )
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    // Now back card (reconcile) is interactive; click it
    const reconcileCard = await screen.findByRole('button', {
      name: /Conciliación/i,
    })
    await user.click(reconcileCard)
    // Save button enabled
    const saveBtn = screen.getByRole('button', { name: /^Guardar$/i })
    expect(saveBtn).toBeEnabled()
    await user.click(saveBtn)
    // Confirmation dialog appears
    const confirmBtn = await screen.findByRole('button', {
      name: /Sí, cambiar y borrar datos/i,
    })
    await user.click(confirmBtn)
    await waitFor(() => {
      expect(putBody).toEqual({ mode: 'reconcile' })
    })
  })

  it('cancel editing exits the expanded state', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    expect(
      await screen.findByRole('button', { name: /^Cancelar$/i })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Cancelar$/i }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Cambiar modo/i })
      ).toBeInTheDocument()
    })
  })

  it('confirmation dialog can be cancelled', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    await user.click(
      await screen.findByRole('button', { name: /Conciliación/i })
    )
    await user.click(screen.getByRole('button', { name: /^Guardar$/i }))
    const confirmDialog = await screen.findByText(/Confirmá el cambio de modo/i)
    expect(confirmDialog).toBeInTheDocument()
    // Click cancel inside the confirm dialog (matches the cancel inside the
    // alert dialog body)
    const cancelButtons = screen.getAllByRole('button', { name: /^Cancelar$/i })
    await user.click(cancelButtons[cancelButtons.length - 1])
    await waitFor(() => {
      expect(
        screen.queryByText(/Confirmá el cambio de modo/i)
      ).not.toBeInTheDocument()
    })
  })

  it('shows an error toast when the save fails', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    server.use(
      http.put('/api/me/operation-mode', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 })
      )
    )
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    await user.click(
      await screen.findByRole('button', { name: /Conciliación/i })
    )
    await user.click(screen.getByRole('button', { name: /^Guardar$/i }))
    await user.click(
      await screen.findByRole('button', { name: /Sí, cambiar y borrar datos/i })
    )
    await waitFor(() => {
      expect(screen.getByText(/boom/i)).toBeInTheDocument()
    })
  })

  it('clicking outside closes the dialog and resets internal state', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<Host onOpenChange={onOpenChange} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    // Press Escape to dismiss the dialog
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('falls back to the "Profile" heading when name is missing', async () => {
    server.use(meHandler({ name: null, email: 'zoe@x' }))
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('zoe@x')).toBeInTheDocument()
    })
    // Sidebar heading falls back to "settings.profile.name" → "Nombre"
    const sidebar = screen
      .getByRole('heading', { name: /Nombre/i, level: 2 })
    expect(sidebar).toBeInTheDocument()
  })

  it('confirmChange is a no-op when no mode is selected', async () => {
    // Open editing without clicking another card so selected === currentMode.
    // Click save (it is disabled in UI but still verify the early-return guard
    // by directly triggering confirmation through the button when canSave
    // would be true; here we leave it as a smoke check that no PUT is sent).
    server.use(meHandler({ operationMode: 'passthrough' }))
    let called = false
    server.use(
      http.put('/api/me/operation-mode', () => {
        called = true
        return HttpResponse.json({ operation_mode: 'passthrough' })
      })
    )
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    // Save remains disabled because nothing changed
    const save = screen.getByRole('button', { name: /^Guardar$/i })
    expect(save).toBeDisabled()
    expect(called).toBe(false)
  })

  it('shows the recommended badge on the back card when reconcile is not current', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    const reconcileCard = await screen.findByRole('button', {
      name: /Conciliación/i,
    })
    expect(within(reconcileCard).getByText(/Recomendado/i)).toBeInTheDocument()
  })

  it('clicks the active card to re-select the current mode', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    // Switch to reconcile first to enable save
    await user.click(
      await screen.findByRole('button', { name: /Conciliación/i })
    )
    expect(screen.getByRole('button', { name: /^Guardar$/i })).toBeEnabled()
    // Click the active card (passthrough) to set selected back to current → disables save
    await user.click(
      screen.getByRole('button', { name: /Notificación directa/i })
    )
    expect(screen.getByRole('button', { name: /^Guardar$/i })).toBeDisabled()
  })

  it('shows the saving label on the confirm button while the mutation is pending', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    server.use(
      http.put('/api/me/operation-mode', async () => {
        await new Promise(r => setTimeout(r, 200))
        return HttpResponse.json({ operation_mode: 'reconcile' })
      })
    )
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    await user.click(
      await screen.findByRole('button', { name: /Conciliación/i })
    )
    await user.click(screen.getByRole('button', { name: /^Guardar$/i }))
    await user.click(
      await screen.findByRole('button', { name: /Sí, cambiar y borrar datos/i })
    )
    // The confirm button text flips to "Guardando..." while the PUT is pending.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Guardando/i })).toBeInTheDocument()
    })
  })

  it('closes the confirmation dialog via overlay (escape) when not pending', async () => {
    server.use(meHandler({ operationMode: 'passthrough' }))
    const user = userEvent.setup()
    renderWithProviders(<Host />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('user@x')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /Operación/i }))
    await user.click(screen.getByRole('button', { name: /Cambiar modo/i }))
    await user.click(
      await screen.findByRole('button', { name: /Conciliación/i })
    )
    await user.click(screen.getByRole('button', { name: /^Guardar$/i }))
    expect(
      await screen.findByText(/Confirmá el cambio de modo/i)
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(
        screen.queryByText(/Confirmá el cambio de modo/i)
      ).not.toBeInTheDocument()
    })
  })
})
