import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import {
  useAccounts,
  useAccount,
  useCreateAccount,
  useDeleteAccount,
  useEnqueueScrape,
  useRestartAccount,
} from './useAccounts'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

describe('useAccounts', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('returns accounts in camelCase shape', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAccounts(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual([
      {
        id: 'a-1',
        bank: 'mi-dinero',
        name: 'Cuenta 1',
        status: 'active',
        scrapeBlockedAt: undefined,
        scrapeBlockedReason: undefined,
      },
    ])
  })
})

describe('useAccount', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('does not fetch when accountId is undefined', () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAccount(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('fetches and returns the account when accountId is provided', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAccount('acc-1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.id).toBe('acc-1')
  })
})

describe('useCreateAccount', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('invalidates the accounts list on successful creation', async () => {
    let listCalls = 0
    server.use(
      http.get('/api/accounts', () => {
        listCalls += 1
        return HttpResponse.json([])
      })
    )

    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => ({ list: useAccounts(), create: useCreateAccount() }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.list.data).toBeDefined())
    expect(listCalls).toBe(1)

    await act(async () => {
      await result.current.create.mutateAsync({ bankId: 'b-1', name: 'foo' })
    })
    await waitFor(() => expect(listCalls).toBe(2))
  })
})

describe('useDeleteAccount', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('invalidates the accounts list on successful deletion', async () => {
    let listCalls = 0
    server.use(
      http.get('/api/accounts', () => {
        listCalls += 1
        return HttpResponse.json([])
      })
    )

    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => ({ list: useAccounts(), remove: useDeleteAccount() }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.list.data).toBeDefined())
    expect(listCalls).toBe(1)

    await act(async () => {
      await result.current.remove.mutateAsync({
        accountId: 'a-1',
        confirmationName: 'Cuenta 1',
      })
    })
    await waitFor(() => expect(listCalls).toBe(2))
  })
})

describe('useEnqueueScrape', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('triggers the scrape endpoint and returns queued', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useEnqueueScrape(), { wrapper })
    await act(async () => {
      const out = await result.current.mutateAsync('a-1')
      expect(out).toEqual({ queued: true })
    })
  })
})

describe('useRestartAccount', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('invalidates both the list and the single account query on success', async () => {
    let listCalls = 0
    let oneCalls = 0
    server.use(
      http.get('/api/accounts', () => {
        listCalls += 1
        return HttpResponse.json([])
      }),
      http.get('/api/accounts/a-1', () => {
        oneCalls += 1
        return HttpResponse.json({
          id: 'a-1',
          bank: 'mi-dinero',
          name: 'Cuenta 1',
          status: 'active',
          scrapeBlockedAt: null,
          scrapeBlockedReason: null,
        })
      })
    )

    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => ({
        list: useAccounts(),
        one: useAccount('a-1'),
        restart: useRestartAccount(),
      }),
      { wrapper }
    )
    await waitFor(() => {
      expect(result.current.list.data).toBeDefined()
      expect(result.current.one.data).toBeDefined()
    })
    expect(listCalls).toBe(1)
    expect(oneCalls).toBe(1)

    await act(async () => {
      await result.current.restart.mutateAsync('a-1')
    })

    await waitFor(() => {
      expect(listCalls).toBe(2)
      expect(oneCalls).toBe(2)
    })
  })
})
