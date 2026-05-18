import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { useUser } from './useUser'
import { setOperationMode } from '../api/me'

describe('useUser', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token')
    server.use(...userHandlers)
  })

  it('maps operation_mode → operationMode', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUser(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({
      id: 'u-1',
      email: 'test@x',
      name: 'T',
      operationMode: 'passthrough',
    })
  })

  it('updates operation mode through the api prefix', async () => {
    let received: unknown = null
    server.use(
      http.put('/api/me/operation-mode', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ operation_mode: 'reconcile' })
      })
    )

    await expect(setOperationMode('reconcile')).resolves.toEqual({ mode: 'reconcile' })
    expect(received).toEqual({ mode: 'reconcile' })
  })
})
