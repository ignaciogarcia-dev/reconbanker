import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/user/providers/AuthProvider'
import { Toaster } from '@/shared/ui/sonner'
import { server } from '../../../tests/msw/server'
import '@/shared/i18n'
import { AppLayout } from './AppLayout'

function meHandler(overrides: Record<string, unknown> = {}) {
  return http.get('/api/me', () =>
    HttpResponse.json({
      id: 'u-1',
      email: 'test@x',
      name: 'Test User',
      operation_mode: 'reconcile',
      ...overrides,
    })
  )
}

function renderLayout(opts: {
  initialPath?: string
  storedUser?: { id: string; email: string; name: string | null }
} = {}) {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem(
    'user',
    JSON.stringify(opts.storedUser ?? { id: 'u-1', email: 'test@x', name: 'Stored Name' })
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[opts.initialPath ?? '/']}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>home outlet</div>} />
              <Route path="/accounts" element={<div>accounts outlet</div>} />
            </Route>
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('AppLayout', () => {
  beforeAll(() => {
    // jsdom doesn't implement pointer-capture APIs that sonner toasts rely on.
    if (!('setPointerCapture' in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        value: () => {},
      })
      Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
        value: () => {},
      })
      Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
        value: () => false,
      })
    }
  })

  beforeEach(() => {
    localStorage.clear()
    server.use(meHandler())
  })

  it('renders the nav, the outlet, and the stored user info', async () => {
    renderLayout()
    expect(screen.getByText('home outlet')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Conciliaciones/i })).toBeInTheDocument()
    })
    expect(screen.getByText('Stored Name')).toBeInTheDocument()
  })

  it('hides the conciliations nav item when operation mode is passthrough', async () => {
    server.use(meHandler({ operation_mode: 'passthrough' }))
    renderLayout()
    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: /Conciliaciones/i })
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
  })

  it('navigates between routes when nav links are clicked', async () => {
    const user = userEvent.setup()
    renderLayout()
    await user.click(screen.getByRole('link', { name: /Cuentas/i }))
    expect(screen.getByText('accounts outlet')).toBeInTheDocument()
  })

  it('logs the user out and navigates to /login when Logout is clicked', async () => {
    const user = userEvent.setup()
    renderLayout()
    await user.click(screen.getByRole('button', { name: /Stored Name/i }))
    const logout = await screen.findByRole('menuitem', { name: /Cerrar sesión/i })
    await user.click(logout)
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('opens the user dropdown menu with Settings and Logout entries', async () => {
    const user = userEvent.setup()
    renderLayout()
    await user.click(screen.getByRole('button', { name: /Stored Name/i }))
    expect(
      await screen.findByRole('menuitem', { name: /Configuración/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /Cerrar sesión/i })
    ).toBeInTheDocument()
  })

  it('toggles the settings dialog open when the Settings menu item is activated', async () => {
    const user = userEvent.setup()
    renderLayout()
    await user.click(screen.getByRole('button', { name: /Stored Name/i }))
    const settings = await screen.findByRole('menuitem', { name: /Configuración/i })
    await user.click(settings)
    // The settings dialog uses the user's name as the heading; loading state is fine.
    await waitFor(() => {
      const dialogs = screen.queryAllByRole('dialog')
      expect(dialogs.length).toBeGreaterThan(0)
    })
  })

  it('shows the mode-select dialog when the user has no operation mode', async () => {
    server.use(meHandler({ operation_mode: null }))
    renderLayout()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('confirms the operation mode, fires the success toast, and routes via the toast action', async () => {
    const user = userEvent.setup()
    let updated = false
    server.use(
      meHandler({ operation_mode: null }),
      http.put('/api/me/operation-mode', () => {
        updated = true
        return HttpResponse.json({ operation_mode: 'reconcile' })
      })
    )
    renderLayout({ initialPath: '/accounts' })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const reconcile = await screen.findByRole('button', { name: /Conciliación/i })
    await user.click(reconcile)
    await user.click(screen.getByRole('button', { name: /Continuar/i }))
    await waitFor(() => expect(updated).toBe(true))
    // The toast shows a "Crear cuenta" action; clicking it should route to /accounts.
    const action = await screen.findByRole('button', { name: /Crear cuenta/i })
    await user.click(action)
    expect(await screen.findByText('accounts outlet')).toBeInTheDocument()
  })

  it('uses the email initial when the user has no name', async () => {
    renderLayout({ storedUser: { id: 'u-1', email: 'zed@x', name: null } })
    await waitFor(() => {
      // Component uses email[0] verbatim (not upper-cased).
      expect(screen.getByText('z')).toBeInTheDocument()
    })
  })

  it('falls back to "?" when there is no name or email', async () => {
    renderLayout({ storedUser: { id: 'u-1', email: '', name: null } })
    await waitFor(() => {
      expect(screen.getByText('?')).toBeInTheDocument()
    })
  })

  it('updates the CSS variables for the mouse spotlight on mousemove', async () => {
    const { container } = renderLayout()
    const root = container.firstElementChild as HTMLElement
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 123, clientY: 45 }))
    await waitFor(() => {
      expect(root.style.getPropertyValue('--mouse-x')).toBe('123px')
      expect(root.style.getPropertyValue('--mouse-y')).toBe('45px')
    })
  })

  it('runs the mascot typing animation timer chain', async () => {
    vi.useFakeTimers()
    try {
      renderLayout()
      // Drive the recursive setTimeout chain: initial delay 800ms, then a
      // typing cycle (~45ms/char), pause (1800ms), erase (~25ms/char).
      await vi.advanceTimersByTimeAsync(5000)
    } finally {
      vi.useRealTimers()
    }
    expect(screen.getByAltText('ReconBanker')).toBeInTheDocument()
  })
})
