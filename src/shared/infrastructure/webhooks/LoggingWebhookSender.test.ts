import { describe, it, expect, vi } from 'vitest'
import { makeLoggingWebhookSender } from './LoggingWebhookSender.js'
import type { WebhookError } from './WebhookSender.js'

const ctx = {
  accountId: 'acc-1',
  subjectType: 'bank_transaction' as const,
  subjectId: 'tx-1',
  attempt: 1,
}

const opts = { url: 'https://hook', payload: { a: 1 }, authType: null, authToken: null }

describe('makeLoggingWebhookSender', () => {
  it('records a success entry and returns the inner result', async () => {
    const log = { record: vi.fn().mockResolvedValue(undefined) }
    const inner = vi.fn().mockResolvedValue({ status: 202, body: 'accepted' })
    const send = makeLoggingWebhookSender(log, ctx, inner as any)

    const result = await send(opts)

    expect(result).toEqual({ status: 202, body: 'accepted' })
    expect(log.record).toHaveBeenCalledTimes(1)
    expect(log.record).toHaveBeenCalledWith({
      ...ctx,
      url: 'https://hook',
      requestPayload: { a: 1 },
      responseStatus: 202,
      responseBody: 'accepted',
      errorMessage: null,
    })
  })

  it('records a failure entry with status/body and rethrows', async () => {
    const log = { record: vi.fn().mockResolvedValue(undefined) }
    const err = Object.assign(new Error('Webhook failed: 500'), { status: 500, body: 'boom' }) as WebhookError
    const inner = vi.fn().mockRejectedValue(err)
    const send = makeLoggingWebhookSender(log, ctx, inner as any)

    await expect(send(opts)).rejects.toThrow('Webhook failed: 500')
    expect(log.record).toHaveBeenCalledWith({
      ...ctx,
      url: 'https://hook',
      requestPayload: { a: 1 },
      responseStatus: 500,
      responseBody: 'boom',
      errorMessage: 'Webhook failed: 500',
    })
  })

  it('records null status/body on a network error (no status on the error)', async () => {
    const log = { record: vi.fn().mockResolvedValue(undefined) }
    const inner = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const send = makeLoggingWebhookSender(log, ctx, inner as any)

    await expect(send(opts)).rejects.toThrow('ECONNRESET')
    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({
      responseStatus: null,
      responseBody: null,
      errorMessage: 'ECONNRESET',
    }))
  })
})
