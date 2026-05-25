import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '../../../../tests/msw/server'
import { conciliationHandlers } from '../../../../tests/msw/handlers/conciliation'
import {
  useConciliations,
  useConciliation,
  useRunConciliation,
  useNotifyConciliation,
  usePollConciliation,
} from './useConciliations'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

describe('useConciliations', () => {
  beforeEach(() => {
    server.use(...conciliationHandlers)
  })

  it('returns the list of conciliations from the API', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useConciliations(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0].externalId).toBe('ord-1')
  })
})

describe('useConciliation', () => {
  beforeEach(() => {
    server.use(...conciliationHandlers)
  })

  it('does not fetch when requestId is undefined', () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useConciliation(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches the detail when requestId is provided', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useConciliation('req-1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.id).toBe('req-1')
  })
})

describe('conciliation mutations', () => {
  beforeEach(() => {
    server.use(...conciliationHandlers)
  })

  it('useRunConciliation triggers the run endpoint', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRunConciliation(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync('req-1')).resolves.toEqual({ queued: true })
    })
  })

  it('useNotifyConciliation triggers the notify endpoint', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useNotifyConciliation(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync('req-1')).resolves.toEqual({ queued: true })
    })
  })

  it('usePollConciliation triggers the poll endpoint', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => usePollConciliation(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync('a-1')).resolves.toEqual({ queued: true })
    })
  })
})
