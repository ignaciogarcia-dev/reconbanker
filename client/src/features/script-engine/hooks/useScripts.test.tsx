import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { scriptEngineHandlers } from '../../../../tests/msw/handlers/scriptEngine'
import { useScripts, usePromoteScript } from './useScripts'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

describe('useScripts', () => {
  beforeEach(() => {
    server.use(...scriptEngineHandlers)
  })

  it('returns the list of scripts from the API', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useScripts(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0].id).toBe('s-1')
  })
})

describe('usePromoteScript', () => {
  beforeEach(() => {
    server.use(...scriptEngineHandlers)
  })

  it('invalidates the scripts list on successful promotion', async () => {
    let listCalls = 0
    server.use(
      http.get('/api/scripts', () => {
        listCalls += 1
        return HttpResponse.json([])
      })
    )

    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => ({ list: useScripts(), promote: usePromoteScript() }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.list.data).toBeDefined())
    expect(listCalls).toBe(1)

    await act(async () => {
      await result.current.promote.mutateAsync('s-1')
    })
    await waitFor(() => expect(listCalls).toBe(2))
  })
})
