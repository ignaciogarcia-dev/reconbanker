import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const childLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
childLog.child.mockReturnValue(childLog)
vi.mock('../logger/index.js', () => ({ logger: { child: vi.fn(() => childLog) } }))

// assertSafeUrl has its own SSRF tests and does real DNS; mock it so these tests stay offline.
const { assertSafeUrlMock } = vi.hoisted(() => ({ assertSafeUrlMock: vi.fn() }))
vi.mock('../../net/assertSafeUrl.js', () => ({ assertSafeUrl: assertSafeUrlMock }))

const { sendChatWebhook } = await import('./ChatWebhookSender.js')

function makeResponse(status: number, body = '', statusText = 'OK') {
  return { ok: status >= 200 && status < 300, status, statusText, text: vi.fn().mockResolvedValue(body) }
}

describe('sendChatWebhook', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    assertSafeUrlMock.mockReset().mockResolvedValue(undefined)
    childLog.info.mockClear(); childLog.warn.mockClear()
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('POSTs {text} as JSON with no Authorization header', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendChatWebhook({ url: 'https://hooks.slack.com/services/T/B/x', text: 'hola' })

    expect(fetchMock).toHaveBeenCalledWith('https://hooks.slack.com/services/T/B/x', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: 'hola' }),
      redirect: 'error',
    }))
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBeUndefined()
  })

  it('re-validates the URL right before sending', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendChatWebhook({ url: 'https://example.com/x', text: 't' })
    expect(assertSafeUrlMock).toHaveBeenCalledWith('https://example.com/x', expect.any(String))
  })

  it('does not send when the URL resolves to a blocked address', async () => {
    assertSafeUrlMock.mockRejectedValueOnce(new Error('blocked: private address'))
    await expect(sendChatWebhook({ url: 'https://rebound.example.com/x', text: 't' })).rejects.toThrow(/blocked/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on a non-2xx response with status + body attached to the error', async () => {
    fetchMock.mockResolvedValue(makeResponse(400, 'invalid_payload', 'Bad Request'))
    await expect(sendChatWebhook({ url: 'https://example.com/x', text: 't' }))
      .rejects.toMatchObject({
        status: 400,
        body: 'invalid_payload',
        message: expect.stringContaining('Chat webhook failed: 400 Bad Request — invalid_payload'),
      })
  })

  it('truncates the error message body to 300 chars while keeping the full body on .body', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'a'.repeat(500), 'Internal Server Error'))
    try {
      await sendChatWebhook({ url: 'https://example.com/x', text: 't' })
      throw new Error('expected to throw')
    } catch (err) {
      const e = err as { status: number; body: string; message: string }
      expect(e.status).toBe(500)
      expect(e.body).toBe('a'.repeat(500))            // full body preserved on the error
      expect(e.message).toContain('a'.repeat(300))     // 300 chars included...
      expect(e.message).not.toContain('a'.repeat(301)) // ...but not 301 — proves truncation
    }
  })

  it('resolves on a 2xx response', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, 'ok'))
    await expect(sendChatWebhook({ url: 'https://example.com/x', text: 't' })).resolves.toBeUndefined()
  })
})
