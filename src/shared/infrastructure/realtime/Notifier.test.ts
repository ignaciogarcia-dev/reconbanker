import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SystemEvent } from './events.js'
import type { Container } from '../../../composition/container.js'

const consumeNotifications = vi.fn()
const sendWebhook = vi.fn()
const sendSlackMessage = vi.fn()
const sendChatWebhook = vi.fn()

vi.mock('./RealtimeBus.js', () => ({
  realtimeBus: { consumeNotifications: (...args: unknown[]) => consumeNotifications(...args) },
}))
vi.mock('../webhooks/WebhookSender.js', () => ({
  sendWebhook: (...args: unknown[]) => sendWebhook(...args),
}))
vi.mock('./SlackSender.js', () => ({
  sendSlackMessage: (...args: unknown[]) => sendSlackMessage(...args),
}))
vi.mock('./ChatWebhookSender.js', () => ({
  sendChatWebhook: (...args: unknown[]) => sendChatWebhook(...args),
}))

import { startNotifier } from './Notifier.js'

type Handler = (event: SystemEvent) => Promise<void>

// `accountOverrides` merges into container.account so tests can supply an
// accountRepository/bankRepository for the resolveAccountLabel lookups.
function makeContainer(config: unknown, accountOverrides: Record<string, unknown> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => logger } as unknown
  const findByAccountId = vi.fn(async () => config)
  const container = {
    logger,
    account: { accountConfigRepository: { findByAccountId }, ...accountOverrides },
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
    sendSlackMessage.mockReset().mockResolvedValue(undefined)
    sendChatWebhook.mockReset().mockResolvedValue(undefined)
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

  it('defaults api auth fields and event data to null when absent', async () => {
    // Subscribed but with no auth configured and an event carrying no data payload: exercises the
    // null side of `authType ?? null`, `authToken ?? null`, and `event.data ?? null`.
    const { container } = makeContainer({
      notificationEndpointUrl: 'https://hook.example.com',
      notificationEvents: ['assistance_required'],
    })
    startNotifier(container)
    await capturedHandler()(event({ data: undefined }))

    expect(sendWebhook).toHaveBeenCalledWith(expect.objectContaining({
      authType: null,
      authToken: null,
      payload: expect.objectContaining({ data: null }),
    }))
  })

  it('ignores dashboard-only events', async () => {
    const { container, findByAccountId } = makeContainer(fullConfig)
    startNotifier(container)
    await capturedHandler()(event({ type: 'assistance.cancelled' }))

    expect(findByAccountId).not.toHaveBeenCalled()
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('delivers session.needs_attention to accounts subscribed to assistance', async () => {
    const { container } = makeContainer({ ...fullConfig, notificationEvents: ['assistance_required'] })
    startNotifier(container)
    await capturedHandler()(event({ type: 'session.needs_attention', data: { reason: 'auth_timeout' } }))

    expect(sendWebhook).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ type: 'assistance_required', status: 'session.needs_attention' }),
    }))
  })

  it('skips session.needs_attention when not subscribed to assistance', async () => {
    const { container } = makeContainer({ ...fullConfig, notificationEvents: ['connection_failed'] })
    startNotifier(container)
    await capturedHandler()(event({ type: 'session.needs_attention', data: { reason: 'auth_timeout' } }))

    expect(sendWebhook).not.toHaveBeenCalled()
  })

  const slackConfig = {
    notificationEvents: ['connection_failed'],
    notificationTransport: 'slack',
    notificationAuthToken: 'xoxb-1',
    notificationSlackChannel: '#alerts',
    notificationEndpointUrl: null,
  }

  it('delivers via Slack when the transport is slack', async () => {
    const { container } = makeContainer(slackConfig)
    startNotifier(container)
    await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

    expect(sendSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'xoxb-1', channel: '#alerts', text: expect.stringContaining('Falla de conexión') }),
    )
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('skips Slack delivery when channel is missing', async () => {
    const { container } = makeContainer({ ...slackConfig, notificationSlackChannel: null })
    startNotifier(container)
    await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

    expect(sendSlackMessage).not.toHaveBeenCalled()
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('skips Slack delivery when token is missing', async () => {
    const { container } = makeContainer({ ...slackConfig, notificationAuthToken: null })
    startNotifier(container)
    await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

    expect(sendSlackMessage).not.toHaveBeenCalled()
    expect(sendWebhook).not.toHaveBeenCalled()
  })

  it('rethrows when Slack delivery fails', async () => {
    const { container, logger } = makeContainer(slackConfig)
    sendSlackMessage.mockRejectedValueOnce(new Error('slack down'))
    startNotifier(container)
    await expect(
      capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } })),
    ).rejects.toThrow('slack down')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('logs a stringified error when Slack delivery rejects a non-Error', async () => {
    const { container, logger } = makeContainer(slackConfig)
    sendSlackMessage.mockRejectedValueOnce('plain')
    startNotifier(container)
    await expect(
      capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } })),
    ).rejects.toBe('plain')
    expect(logger.warn).toHaveBeenCalledWith(
      'notification delivery failed; will retry',
      expect.objectContaining({ error: 'plain' }),
    )
  })

  const chatConfig = {
    notificationEvents: ['connection_failed'],
    notificationTransport: 'chat_webhook',
    notificationEndpointUrl: 'https://hooks.slack.com/services/T/B/x',
    notificationAuthToken: null,
    notificationSlackChannel: null,
  }

  it('delivers via chat webhook when the transport is chat_webhook', async () => {
    const { container } = makeContainer(chatConfig)
    startNotifier(container)
    await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

    expect(sendChatWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://hooks.slack.com/services/T/B/x',
        text: expect.stringContaining('Falla de conexión'),
      }),
    )
    expect(sendWebhook).not.toHaveBeenCalled()
    expect(sendSlackMessage).not.toHaveBeenCalled()
  })

  it('skips chat webhook delivery when the URL is missing', async () => {
    const { container } = makeContainer({ ...chatConfig, notificationEndpointUrl: null })
    startNotifier(container)
    await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

    expect(sendChatWebhook).not.toHaveBeenCalled()
  })

  it('rethrows when chat webhook delivery fails', async () => {
    const { container, logger } = makeContainer(chatConfig)
    sendChatWebhook.mockRejectedValueOnce(new Error('hook 400'))
    startNotifier(container)
    await expect(
      capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } })),
    ).rejects.toThrow('hook 400')
    expect(logger.warn).toHaveBeenCalled()
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

  describe('resolveAccountLabel', () => {
    it('renders the bank + account name when both lookups succeed', async () => {
      const accountRepository = { findById: vi.fn(async () => ({ id: 'acc-1', bankId: 'b-1', name: 'Mi cuenta sueldo' })) }
      const bankRepository = { findById: vi.fn(async () => ({ id: 'b-1', name: 'Banco Pichincha' })) }
      const { container } = makeContainer(slackConfig, { accountRepository, bankRepository })
      startNotifier(container)
      await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

      expect(accountRepository.findById).toHaveBeenCalledWith('acc-1')
      expect(bankRepository.findById).toHaveBeenCalledWith('b-1')
      expect(sendSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Banco Pichincha · Mi cuenta sueldo') }),
      )
    })

    it('falls back to null fields when the bank has no name and no bankRepository is present', async () => {
      // account found but bankRepository absent => bank undefined => bankName null; account.name null too.
      const accountRepository = { findById: vi.fn(async () => ({ id: 'acc-1', bankId: 'b-1', name: null })) }
      const { container } = makeContainer(slackConfig, { accountRepository })
      startNotifier(container)
      await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

      // With no usable label the message falls back to "cuenta <id>".
      expect(sendSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('cuenta acc-1') }),
      )
    })

    it('falls back to "cuenta <id>" when the account is not found', async () => {
      const accountRepository = { findById: vi.fn(async () => null) }
      const bankRepository = { findById: vi.fn() }
      const { container } = makeContainer(slackConfig, { accountRepository, bankRepository })
      startNotifier(container)
      await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

      expect(bankRepository.findById).not.toHaveBeenCalled()
      expect(sendSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('cuenta acc-1') }),
      )
    })

    it('falls back to "cuenta <id>" when the account lookup throws', async () => {
      const accountRepository = { findById: vi.fn(async () => { throw new Error('db down') }) }
      const { container } = makeContainer(slackConfig, { accountRepository })
      startNotifier(container)
      await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

      expect(sendSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('cuenta acc-1') }),
      )
    })

    it('resolves the label for a chat_webhook transport too', async () => {
      const accountRepository = { findById: vi.fn(async () => ({ id: 'acc-1', bankId: 'b-1', name: 'Cuenta X' })) }
      const bankRepository = { findById: vi.fn(async () => ({ id: 'b-1', name: 'Banco Y' })) }
      const { container } = makeContainer(chatConfig, { accountRepository, bankRepository })
      startNotifier(container)
      await capturedHandler()(event({ type: 'connection.failed', data: { category: 'navigation_failed' } }))

      expect(sendChatWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Banco Y · Cuenta X') }),
      )
    })
  })
})
