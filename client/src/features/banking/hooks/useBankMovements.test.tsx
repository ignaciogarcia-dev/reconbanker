import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '../../../../tests/msw/server'
import { bankingHandlers } from '../../../../tests/msw/handlers/banking'
import { useBankMovements, useReNotifyMovement, bankMovementsQueryKey } from './useBankMovements'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

describe('useBankMovements', () => {
  beforeEach(() => {
    server.use(...bankingHandlers)
  })

  it('does not fetch when accountId is undefined', () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useBankMovements(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('returns the list of movements when an accountId is provided', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useBankMovements('a-1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0].externalId).toBe('ext-1')
  })

  it('uses a stable query key shape', () => {
    expect(bankMovementsQueryKey('a-1')).toEqual(['bank-movements', 'a-1'])
  })
})

describe('useReNotifyMovement', () => {
  beforeEach(() => {
    server.use(...bankingHandlers)
  })

  it('returns queued on successful re-notify', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useReNotifyMovement('a-1'), { wrapper })
    await act(async () => {
      const out = await result.current.mutateAsync('m-1')
      expect(out).toEqual({ queued: true })
    })
  })
})
