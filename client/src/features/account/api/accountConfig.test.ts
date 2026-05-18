import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { getAccountConfig, upsertAccountConfig } from './accountConfig'

describe('accountConfig api', () => {
  it('maps snake_case row to camelCase AccountConfig', async () => {
    server.use(
      http.get('http://localhost:3000/accounts/acc-1/config', () =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: 'acc-1',
          pending_orders_endpoint: null,
          webhook_url: 'https://hook',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: 'tok',
          webhook_auth_type: null,
          webhook_auth_token: null,
          notify_on_expired: false,
          webhook_extra_fields: { source: 'fe' },
          silent_ingestion: true,
          bank_username: 'alice',
        })
      )
    )
    const cfg = await getAccountConfig('acc-1')
    expect(cfg).toEqual({
      id: 'cfg-1',
      accountId: 'acc-1',
      pendingOrdersEndpoint: null,
      webhookUrl: 'https://hook',
      retryLimit: 3,
      pollingMethod: 'GET',
      pollingBody: null,
      authType: 'bearer',
      authToken: 'tok',
      webhookAuthType: null,
      webhookAuthToken: null,
      notifyOnExpired: false,
      webhookExtraFields: { source: 'fe' },
      silentIngestion: true,
      bankUsername: 'alice',
    })
  })

  it('returns null when the server responds with null', async () => {
    server.use(
      http.get('http://localhost:3000/accounts/acc-1/config', () =>
        HttpResponse.json(null)
      )
    )
    expect(await getAccountConfig('acc-1')).toBeNull()
  })

  it('sends camelCase input as snake_case body on upsert', async () => {
    let received: unknown = null
    server.use(
      http.put('http://localhost:3000/accounts/acc-1/config', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({
          id: 'cfg-1', account_id: 'acc-1',
          pending_orders_endpoint: null, webhook_url: 'h',
          retry_limit: 3, polling_method: 'GET', polling_body: null,
          auth_type: 'bearer', auth_token: null,
          webhook_auth_type: null, webhook_auth_token: null,
          notify_on_expired: false, webhook_extra_fields: null,
          silent_ingestion: false, bank_username: null,
        })
      })
    )
    await upsertAccountConfig('acc-1', {
      pendingOrdersEndpoint: null, webhookUrl: 'h',
      retryLimit: 3, pollingMethod: 'GET', pollingBody: null,
      authType: 'bearer', authToken: null,
      webhookAuthType: null, webhookAuthToken: null,
      notifyOnExpired: false, webhookExtraFields: null,
      silentIngestion: false,
      bankUsername: 'alice', bankPassword: 'secret',
    })
    expect(received).toEqual({
      pending_orders_endpoint: null, webhook_url: 'h',
      retry_limit: 3, polling_method: 'GET', polling_body: null,
      auth_type: 'bearer', auth_token: null,
      webhook_auth_type: null, webhook_auth_token: null,
      notify_on_expired: false, webhook_extra_fields: null,
      silent_ingestion: false,
      bank_username: 'alice', bank_password: 'secret',
    })
  })
})
