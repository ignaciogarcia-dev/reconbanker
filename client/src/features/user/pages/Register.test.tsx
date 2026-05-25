import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Register } from './Register'

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
    await user.type(screen.getByLabelText(/Email/i), 'new@x')
    await user.type(screen.getByLabelText(/Contraseña/i), 'pw')
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
        return HttpResponse.json({ id: 'x', email: 'x@x' })
      })
    )
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Nombre/i), 'Alice')
    await user.type(screen.getByLabelText(/Email/i), 'x@x')
    await user.type(screen.getByLabelText(/Contraseña/i), 'pw')
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    await waitFor(() => {
      expect(received).toEqual({ email: 'x@x', password: 'pw', name: 'Alice' })
    })
  })

  it('shows the server-provided error message on conflict', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText(/Email/i), 'taken@x')
    await user.type(screen.getByLabelText(/Contraseña/i), 'pw')
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
    await user.type(screen.getByLabelText(/Email/i), 'x@x')
    await user.type(screen.getByLabelText(/Contraseña/i), 'pw')
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
    await user.type(screen.getByLabelText(/Email/i), 'x@x')
    await user.type(screen.getByLabelText(/Contraseña/i), 'pw')
    await user.click(screen.getByRole('button', { name: /^Registrar$/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/Error al registrar el usuario/i)
      ).toBeInTheDocument()
    })
  })

  it('has a link back to login', () => {
    renderRegister()
    const link = screen.getByRole('link', { name: /Ingresar/i })
    expect(link).toHaveAttribute('href', '/login')
  })
})
