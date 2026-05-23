import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { useAccountConfig, useUpsertAccountConfig, accountConfigQueryKey } from './useAccountConfig'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

describe('useAccountConfig', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('does not fetch when accountId is undefined', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAccountConfig(undefined), { wrapper })
    // Query should stay in idle (fetchStatus 'idle' because enabled=false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('fetches and returns the config when accountId is provided', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAccountConfig('acc-1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.accountId).toBe('acc-1')
  })

  it('uses a stable query key shape', () => {
    expect(accountConfigQueryKey('acc-1')).toEqual(['account-config', 'acc-1'])
    expect(accountConfigQueryKey(undefined)).toEqual(['account-config', undefined])
  })
})

describe('useUpsertAccountConfig', () => {
  beforeEach(() => {
    server.use(...accountHandlers)
  })

  it('invalidates the account-config query on successful save', async () => {
    let getCalls = 0
    server.use(
      http.get('/api/accounts/acc-2/config', () => {
        getCalls += 1
        return HttpResponse.json({
          id: 'cfg-2',
          account_id: 'acc-2',
          pending_orders_endpoint: null,
          webhook_url: 'https://hook',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: null,
          webhook_auth_type: null,
          webhook_auth_token: null,
          notify_on_expired: false,
          webhook_extra_fields: null,
          silent_ingestion: false,
          session_type: 'one-shot',
          login_mode: 'simple',
          bank_username: null,
        })
      })
    )

    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => ({
        cfg: useAccountConfig('acc-2'),
        save: useUpsertAccountConfig('acc-2'),
      }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.cfg.data).toBeDefined())
    expect(getCalls).toBe(1)

    await act(async () => {
      await result.current.save.mutateAsync({
        pendingOrdersEndpoint: null,
        webhookUrl: 'https://hook',
        retryLimit: 3,
        pollingMethod: 'GET',
        pollingBody: null,
        authType: 'bearer',
        authToken: null,
        webhookAuthType: null,
        webhookAuthToken: null,
        notifyOnExpired: false,
        webhookExtraFields: null,
        silentIngestion: false,
        sessionType: 'one-shot',
        loginMode: 'simple',
        bankUsername: 'alice',
        bankPassword: 'pwd',
      })
    })

    // After invalidate, the query should refetch — expect a second GET.
    await waitFor(() => expect(getCalls).toBe(2))
  })

  it('propagates the server error when the PUT fails', async () => {
    server.use(
      http.put('/api/accounts/acc-3/config', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 })
      )
    )
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpsertAccountConfig('acc-3'), { wrapper })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          pendingOrdersEndpoint: null,
          webhookUrl: 'https://hook',
          retryLimit: 3,
          pollingMethod: 'GET',
          pollingBody: null,
          authType: 'bearer',
          authToken: null,
          webhookAuthType: null,
          webhookAuthToken: null,
          notifyOnExpired: false,
          webhookExtraFields: null,
          silentIngestion: false,
          sessionType: 'one-shot',
          loginMode: 'simple',
          bankUsername: null,
          bankPassword: null,
        })
      ).rejects.toBeDefined()
    })
  })
})
