import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendSlackMessage } from './SlackSender.js'

afterEach(() => { vi.restoreAllMocks() })

function stubFetch(impl: (url: string, init: RequestInit) => { ok: boolean; status?: number; statusText?: string; body: unknown }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
    const r = impl(String(url), init)
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      statusText: r.statusText ?? '',
      json: async () => r.body,
    } as unknown as Response
  })
}

describe('sendSlackMessage', () => {
  it('POSTs to chat.postMessage with a Bearer token and {channel,text}', async () => {
    const fetchSpy = stubFetch(() => ({ ok: true, body: { ok: true } }))
    await sendSlackMessage({ token: 'xoxb-123', channel: '#alerts', text: 'hola' })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer xoxb-123' }),
        body: JSON.stringify({ channel: '#alerts', text: 'hola' }),
      }),
    )
  })

  it('throws when Slack returns ok:false even with HTTP 200', async () => {
    stubFetch(() => ({ ok: true, status: 200, body: { ok: false, error: 'channel_not_found' } }))
    await expect(sendSlackMessage({ token: 't', channel: 'C1', text: 'x' }))
      .rejects.toThrow(/channel_not_found/)
  })

  it('throws on a non-2xx HTTP response', async () => {
    stubFetch(() => ({ ok: false, status: 429, statusText: 'Too Many Requests', body: null }))
    await expect(sendSlackMessage({ token: 't', channel: 'C1', text: 'x' }))
      .rejects.toThrow(/Slack chat.postMessage failed/)
  })

  it('throws with the HTTP status when the response body is not valid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new SyntaxError('invalid json') },
    } as unknown as Response))

    await expect(sendSlackMessage({ token: 't', channel: 'C1', text: 'x' }))
      .rejects.toThrow(/HTTP 500 Internal Server Error/)
  })

  it('resolves when Slack returns ok:true', async () => {
    stubFetch(() => ({ ok: true, body: { ok: true } }))
    await expect(sendSlackMessage({ token: 't', channel: 'C1', text: 'x' })).resolves.toBeUndefined()
  })
})
