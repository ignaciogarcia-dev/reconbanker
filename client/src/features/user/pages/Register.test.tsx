import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Register } from './Register'
import { firstFailingPasswordRule } from '../utils/passwordRules'

// Spy mode keeps the real implementation except where a test overrides it
vi.mock('../utils/passwordRules', { spy: true })

function passwordValidationError() {
  return HttpResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        details: { issues: [{ path: ['password'], message: 'server password message' }] },
      },
    },
    { status: 400 }
  )
}

const VALID_PASSWORD = 'ValidPassword1'

function renderRegister() {
  return renderWithProviders(
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<div>LOGIN_PAGE</div>} />
    </Routes>,
    { initialEntries: ['/register'], authenticated: false }
  )
}

describe('Register page', () => {
  beforeEach(() => {
    server.use(...userHandlers)
  })

  it('navigates to /login on successful registration', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'new@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    await waitFor(() => {
      expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument()
    })
  })

  it('submits the name when provided', async () => {
    let received: unknown = null
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ id: 'x', email: 'x@x.com' })
      })
    )
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Nombre/i), 'Alice')
    await user.type(screen.getByLabelText(/Email/i), 'x@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    await waitFor(() => {
      expect(received).toEqual({ email: 'x@x.com', password: VALID_PASSWORD, name: 'Alice' })
    })
  })

  it('shows password rules one at a time', async () => {
    const user = userEvent.setup()
    renderRegister()
    const password = screen.getByLabelText(/Contraseña/i)
    await user.type(screen.getByLabelText(/Email/i), 'x@x.com')
    await user.type(password, 'corta')
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    // only the first failing rule is shown
    expect(await screen.findByText(/al menos 12 caracteres/i)).toBeInTheDocument()
    expect(screen.queryByText(/mayúscula/i)).not.toBeInTheDocument()

    // fixing the length reveals the next rule (uppercase)
    await user.clear(password)
    await user.type(password, 'minusculas123')
    expect(await screen.findByText(/letra mayúscula/i)).toBeInTheDocument()
    expect(screen.queryByText(/al menos 12 caracteres/i)).not.toBeInTheDocument()

    // a valid password clears the error
    await user.clear(password)
    await user.type(password, VALID_PASSWORD)
    await waitFor(() => {
      expect(screen.queryByText(/contraseña debe/i)).not.toBeInTheDocument()
    })
  })

  it('shows an email format error when the email is malformed', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    expect(await screen.findByText(/Ingresá un email válido/i)).toBeInTheDocument()
  })

  it('shows per-field required errors when submitting empty', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    const messages = await screen.findAllByText(/Completá este campo/i)
    expect(messages).toHaveLength(2)
  })

  it('shows the server-provided error message on conflict', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'taken@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    await waitFor(() => {
      expect(screen.getByText('Email already in use')).toBeInTheDocument()
    })
  })

  it('shows the default error message when server returns no error body', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 })
      )
    )
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'x@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    // server response error message "boom" propagated
    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument()
    })
  })

  it('falls back to default error message when server response lacks an error field', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({}, { status: 500 })
      )
    )
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'x@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/Error al registrar el usuario/i)
      ).toBeInTheDocument()
    })
  })

  it('maps a server validation error on email to the email field', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              details: { issues: [{ path: ['email'], message: 'bad email' }] },
            },
          },
          { status: 400 }
        )
      )
    )
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'x@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    expect(await screen.findByText(/Ingresá un email válido/i)).toBeInTheDocument()
  })

  it('shows the server message for a password issue when local rules all pass', async () => {
    server.use(http.post('/api/auth/register', () => passwordValidationError()))
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'x@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    expect(await screen.findByText('server password message')).toBeInTheDocument()
  })

  it('shows the localized rule when the server rejects a password the mirror missed', async () => {
    server.use(http.post('/api/auth/register', () => passwordValidationError()))
    // Simulate the local mirror drifting behind the backend policy:
    // it passes during client-side validation but fails when mapping the server error.
    vi.mocked(firstFailingPasswordRule)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce('minLength')
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'x@x.com')
    await user.type(screen.getByLabelText(/Contraseña/i), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    expect(await screen.findByText(/al menos 12 caracteres/i)).toBeInTheDocument()
  })

  it('has a link back to login', () => {
    renderRegister()
    const link = screen.getByRole('link', { name: /Ingresar/i })
    expect(link).toHaveAttribute('href', '/login')
  })
})
