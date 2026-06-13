import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SystemEvent } from './events.js'
import type { Container } from '../../../composition/container.js'

const consumeNotifications = vi.fn()
const sendWebhook = vi.fn()

vi.mock('./RealtimeBus.js', () => ({
  realtimeBus: { consumeNotifications: (...args: unknown[]) => consumeNotifications(...args) },
}))
vi.mock('../webhooks/WebhookSender.js', () => ({
  sendWebhook: (...args: unknown[]) => sendWebhook(...args),
}))

import { startNotifier } from './Notifier.js'

type Handler = (event: SystemEvent) => Promise<void>

function makeContainer(config: unknown) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => logger } as unknown
  const findByAccountId = vi.fn(async () => config)
  const container = {
    logger,
    account: { accountConfigRepository: { findByAccountId } },
  } as unknown as Container
  return { container, findByAccountId, logger: logger as { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> } }
}

function event(overrides: Partial<SystemEvent> = {}): SystemEvent {
  return {
    type: 'assistance.requested', userId: 'u-1', accountId: 'acc-1',
    data: { length: 6 }, occurredAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

const fullConfig = {
  notificationEndpointUrl: 'https://hook.example.com',
  notificationEvents: ['assistance_required'],
  notificationAuthType: 'bearer',
  notificationAuthToken: 'tok',
}

function capturedHandler(): Handler {
  return consumeNotifications.mock.calls.at(-1)![1] as Handler
}

describe('startNotifier', () => {
  beforeEach(() => {
    consumeNotifications.mockReset().mockResolvedValue(undefined)
    sendWebhook.mockReset().mockResolvedValue({ ok: true })
  })

  it('delivers a subscribed event to the configured endpoint', async () => {
    const { container } = makeContainer(fullConfig)
    startNotifier(container)
    await capturedHandler()(event())

    expect(sendWebhook).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://hook.example.com',
      authType: 'bearer',
      authToken: 'tok',
      payload: expect.objectContaining({ account_id: 'acc-1', type: 'assistance_required', status: 'assistance.requested' }),
    }))
  })

  it('ignores dashboard-only events', async () => {
    const { container, findByAccountId } = makeContainer(fullConfig)
    startNotifier(container)
    await capturedHandler()(event({ type: 'session.started' }))

    expect(findByAccountId).not.toHaveBeenCalled()
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('skips when there is no config or no endpoint', async () => {
    const { container } = makeContainer(null)
    startNotifier(container)
    await capturedHandler()(event())
    expect(sendWebhook).not.toHaveBeenCalled()

    const withoutUrl = makeContainer({ notificationEndpointUrl: null, notificationEvents: ['assistance_required'] })
    startNotifier(withoutUrl.container)
    await capturedHandler()(event())
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('skips when the event type is not subscribed', async () => {
    const { container } = makeContainer({ ...fullConfig, notificationEvents: [] })
    startNotifier(container)
    await capturedHandler()(event())
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('defaults events list and auth to null/empty when absent', async () => {
    const { container } = makeContainer({ notificationEndpointUrl: 'https://hook.example.com' })
    startNotifier(container)
    await capturedHandler()(event())
    // notificationEvents undefined => subscribed list empty => not delivered
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('rethrows so a failed delivery stays un-acked', async () => {
    const { container, logger } = makeContainer(fullConfig)
    sendWebhook.mockRejectedValueOnce(new Error('boom'))
    startNotifier(container)
    await expect(capturedHandler()(event())).rejects.toThrow('boom')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('swallows a config lookup failure', async () => {
    const { container } = makeContainer(fullConfig)
    container.account.accountConfigRepository.findByAccountId = vi.fn().mockRejectedValue(new Error('db down'))
    startNotifier(container)
    await capturedHandler()(event())
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('stops the loop via the returned handle', () => {
    const { container } = makeContainer(fullConfig)
    const handle = startNotifier(container)
    expect(() => handle.stop()).not.toThrow()
  })

  it('logs when the consume loop crashes', async () => {
    consumeNotifications.mockRejectedValueOnce(new Error('loop crashed'))
    const { container, logger } = makeContainer(fullConfig)
    const errorLog = (container.logger as unknown as { error: ReturnType<typeof vi.fn> }).error
    startNotifier(container)
    await Promise.resolve()
    await Promise.resolve()
    expect(errorLog).toHaveBeenCalledWith('notifier loop crashed', expect.objectContaining({ error: expect.any(String) }))
    void logger
  })
})
