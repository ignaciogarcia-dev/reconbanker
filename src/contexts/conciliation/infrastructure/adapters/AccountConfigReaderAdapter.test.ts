import { describe, it, expect, vi } from 'vitest'
import { AccountConfigReaderAdapter } from './AccountConfigReaderAdapter.js'

describe('AccountConfigReaderAdapter', () => {
  describe('findPollingConfig', () => {
    it('returns null when no row', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      expect(await adapter.findPollingConfig('acc-1')).toBeNull()
      const [sql, params] = pool.query.mock.calls[0]
      expect(sql).toContain('FROM account_config')
      expect(sql).toContain('pending_orders_endpoint')
      expect(params).toEqual(['acc-1'])
    })

    it('maps row to PollingConfig', async () => {
      const row = {
        account_id: 'acc-1',
        pending_orders_endpoint: 'https://x.io/pending',
        polling_method: 'POST',
        polling_body: { foo: 'bar' },
        auth_type: 'bearer',
        auth_token: 'tok',
      }
      const pool = { query: vi.fn().mockResolvedValue({ rows: [row] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      expect(await adapter.findPollingConfig('acc-1')).toEqual({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://x.io/pending',
        pollingMethod: 'POST',
        pollingBody: { foo: 'bar' },
        authType: 'bearer',
        authToken: 'tok',
      })
    })
  })

  describe('findWebhookConfigForRequest', () => {
    it('returns null when no row', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      expect(await adapter.findWebhookConfigForRequest('req-1')).toBeNull()
      const [sql, params] = pool.query.mock.calls[0]
      expect(sql).toContain('FROM conciliation_requests cr')
      expect(sql).toContain('JOIN account_config ac')
      expect(params).toEqual(['req-1'])
    })

    it('maps row to WebhookConfig and coerces notify_on_expired to boolean (truthy)', async () => {
      const row = {
        account_id: 'acc-1',
        webhook_url: 'https://x.io/wh',
        webhook_auth_type: 'bearer',
        webhook_auth_token: 'wh-tok',
        auth_type: 'api_key',
        auth_token: 'tok',
        webhook_extra_fields: { a: 1 },
        notify_on_expired: 1,
      }
      const pool = { query: vi.fn().mockResolvedValue({ rows: [row] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      expect(await adapter.findWebhookConfigForRequest('req-1')).toEqual({
        accountId: 'acc-1',
        webhookUrl: 'https://x.io/wh',
        webhookAuthType: 'bearer',
        webhookAuthToken: 'wh-tok',
        authType: 'api_key',
        authToken: 'tok',
        webhookExtraFields: { a: 1 },
        notifyOnExpired: true,
      })
    })

    it('coerces notify_on_expired to false when falsy', async () => {
      const row = {
        account_id: 'acc-1',
        webhook_url: null,
        webhook_auth_type: null,
        webhook_auth_token: null,
        auth_type: null,
        auth_token: null,
        webhook_extra_fields: null,
        notify_on_expired: null,
      }
      const pool = { query: vi.fn().mockResolvedValue({ rows: [row] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      const out = await adapter.findWebhookConfigForRequest('req-1')
      expect(out?.notifyOnExpired).toBe(false)
    })
  })

  describe('shouldNotifyOnExpired', () => {
    it('returns true when notify_on_expired is truthy', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ notify_on_expired: true }] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      expect(await adapter.shouldNotifyOnExpired('acc-1')).toBe(true)
      const [sql, params] = pool.query.mock.calls[0]
      expect(sql).toContain('SELECT notify_on_expired FROM account_config')
      expect(params).toEqual(['acc-1'])
    })

    it('returns false when notify_on_expired is falsy', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ notify_on_expired: false }] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      expect(await adapter.shouldNotifyOnExpired('acc-1')).toBe(false)
    })

    it('returns false when row is missing', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
      const adapter = new AccountConfigReaderAdapter(pool as any)
      expect(await adapter.shouldNotifyOnExpired('acc-1')).toBe(false)
    })
  })
})
