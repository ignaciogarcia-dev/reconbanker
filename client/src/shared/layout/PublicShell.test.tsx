import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, AuthProvider } from '@/features/user/providers/AuthProvider'
import { PublicShell } from './PublicShell'

function renderShell(authenticated: boolean) {
  if (authenticated) {
    localStorage.setItem('token', 'tok')
    localStorage.setItem('user', JSON.stringify({ id: 'u-1', email: 'e@x', name: 'E' }))
  } else {
    localStorage.clear()
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Routes>
            <Route element={<PublicShell />}>
              <Route path="/login" element={<div>login page</div>} />
            </Route>
            <Route path="/" element={<div>home page</div>} />
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('PublicShell', () => {
  it('renders the public outlet when there is no user', () => {
    renderShell(false)
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('redirects authenticated users to the home page', () => {
    renderShell(true)
    expect(screen.getByText('home page')).toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })

  it('renders nothing while auth is still loading', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthContext.Provider value={{ user: null, login: async () => {}, logout: () => {}, isLoading: true }}>
          <Routes>
            <Route element={<PublicShell />}>
              <Route path="/login" element={<div>login page</div>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
    expect(container.textContent).toBe('')
  })
})
