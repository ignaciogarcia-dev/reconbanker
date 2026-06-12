import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Login } from './Login'

function HomeMarker() {
  return <div>HOME_PAGE</div>
}

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeMarker />} />
      <Route path="/register" element={<div>REGISTER_PAGE</div>} />
    </Routes>,
    { initialEntries: ['/login'], authenticated: false }
  )
}

describe('Login page', () => {
  beforeEach(() => {
    server.use(...userHandlers)
  })

  it('navigates to "/" on successful login', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/Email/i), 'ok@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'good')
    await user.click(screen.getByRole('button', { name: /Ingresar/i }))
    await waitFor(() => {
      expect(screen.getByText('HOME_PAGE')).toBeInTheDocument()
    })
  })

  it('shows an error message when credentials are rejected', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/Email/i), 'fail@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /Ingresar/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/Email o contraseña incorrectos/i)
      ).toBeInTheDocument()
    })
  })

  it('shows per-field required errors when submitting empty', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: /Ingresar/i }))
    const messages = await screen.findAllByText(/Completá este campo/i)
    expect(messages).toHaveLength(2)
    expect(screen.getByLabelText(/Email/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Contraseña/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows an email format error and clears it live once fixed', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/Email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/Contraseña/i), 'good')
    await user.click(screen.getByRole('button', { name: /Ingresar/i }))
    expect(await screen.findByText(/Ingresá un email válido/i)).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Email/i))
    await user.type(screen.getByLabelText(/Email/i), 'ok@x.com')
    await waitFor(() => {
      expect(screen.queryByText(/Ingresá un email válido/i)).not.toBeInTheDocument()
    })
  })

  it('shows the TOTP step for a 2FA user and logs in with a valid code', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/Email/i), '2fa@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'good')
    await user.click(screen.getByRole('button', { name: /Ingresar/i }))

    // second step appears
    const codeField = await screen.findByLabelText(/Código de autenticación/i)
    await user.type(codeField, '123456')
    await user.click(screen.getByRole('button', { name: /Verificar/i }))
    await waitFor(() => expect(screen.getByText('HOME_PAGE')).toBeInTheDocument())
  })

  it('shows an error on an invalid TOTP code and lets the user go back', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/Email/i), '2fa@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), 'good')
    await user.click(screen.getByRole('button', { name: /Ingresar/i }))

    await user.type(await screen.findByLabelText(/Código de autenticación/i), '000000')
    await user.click(screen.getByRole('button', { name: /Verificar/i }))
    await waitFor(() => expect(screen.getByText(/Código inválido/i)).toBeInTheDocument())

    // back returns to the credentials step
    await user.click(screen.getByRole('button', { name: /Volver/i }))
    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument())
  })

  it('has a link to the register page', async () => {
    renderLogin()
    const link = screen.getByRole('link', { name: /Registrarse/i })
    expect(link).toHaveAttribute('href', '/register')
  })
})
