import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { useAccounts } from './useAccounts'

describe('useAccounts', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('returns accounts in camelCase shape', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useAccounts(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual([
      { id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active' },
    ])
  })
})
