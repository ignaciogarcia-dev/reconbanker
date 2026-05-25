import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Route, Routes, useLocation } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Accounts } from './Accounts'

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

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

  it('renders the fallback values for null name, unknown bank code, and inactive status with attention badge', async () => {
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([
          {
            id: 'a-fallbacks',
            bank: 'unknown-bank',
            name: null,
            status: 'inactive',
            scrapeBlockedReason: 'creds rotated',
            scrapeBlockedAt: '2026-05-23T10:00:00Z',
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
    expect(screen.getByText(/Requiere atención/i)).toBeInTheDocument()
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
})
