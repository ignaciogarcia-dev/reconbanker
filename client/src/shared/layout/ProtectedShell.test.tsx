import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, AuthProvider } from '@/features/user/providers/AuthProvider'

vi.mock('./AppLayout', () => ({
  AppLayout: () => <div>app layout</div>,
}))

import { ProtectedShell } from './ProtectedShell'

function renderShell(authenticated: boolean) {
  if (authenticated) {
    localStorage.setItem('token', 'tok')
    localStorage.setItem('user', JSON.stringify({ id: 'u-1', email: 'e@x', name: 'E' }))
  } else {
    localStorage.clear()
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedShell />}>
              <Route path="/" element={<div>protected child</div>} />
            </Route>
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('ProtectedShell', () => {
  it('renders the AppLayout when a user is authenticated', () => {
    renderShell(true)
    expect(screen.getByText('app layout')).toBeInTheDocument()
  })

  it('redirects unauthenticated users to /login', () => {
    renderShell(false)
    expect(screen.getByText('login page')).toBeInTheDocument()
    expect(screen.queryByText('app layout')).not.toBeInTheDocument()
  })

  it('renders nothing while auth is still loading', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext.Provider value={{ user: null, login: async () => {}, logout: () => {}, isLoading: true }}>
          <Routes>
            <Route element={<ProtectedShell />}>
              <Route path="/" element={<div>protected child</div>} />
            </Route>
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
    expect(screen.queryByText('protected child')).not.toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
    expect(container.textContent).toBe('')
  })
})
