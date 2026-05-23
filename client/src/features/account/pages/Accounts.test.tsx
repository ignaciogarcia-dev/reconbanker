import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Accounts } from './Accounts'

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
})
