import { describe, it, expect, vi } from 'vitest'
import { NotificationConfigReaderAdapter } from './NotificationConfigReaderAdapter.js'

describe('NotificationConfigReaderAdapter', () => {
  it('returns null when configRepo returns null', async () => {
    const configRepo = { findByAccountId: vi.fn().mockResolvedValue(null) }
    const adapter = new NotificationConfigReaderAdapter(configRepo as any)
    expect(await adapter.findByAccountId('acc-1')).toBeNull()
    expect(configRepo.findByAccountId).toHaveBeenCalledWith('acc-1')
  })

  it('maps configRepo result to BankMovementNotificationConfig', async () => {
    const cfg = {
      accountId: 'acc-1',
      webhookUrl: 'https://example.com/wh',
      webhookAuthType: 'bearer',
      webhookAuthToken: 'wh-tok',
      authType: 'api_key',
      authToken: 'tok',
      webhookExtraFields: { foo: 'bar' },
      silentIngestion: true,
    }
    const configRepo = { findByAccountId: vi.fn().mockResolvedValue(cfg) }
    const adapter = new NotificationConfigReaderAdapter(configRepo as any)

    expect(await adapter.findByAccountId('acc-1')).toEqual(cfg)
  })
})
