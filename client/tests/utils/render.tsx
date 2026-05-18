import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/user/providers/AuthProvider'
import '@/shared/i18n'

interface Options {
  initialEntries?: string[]
  authenticated?: boolean
}

export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  if (opts.authenticated !== false) {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'u-1', email: 'test@x', name: 'T' })
    )
  } else {
    localStorage.clear()
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={opts.initialEntries ?? ['/']}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{ui}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}
