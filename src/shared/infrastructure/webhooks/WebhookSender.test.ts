import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const childLog = {
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  child: vi.fn(),
}
childLog.child.mockReturnValue(childLog)

vi.mock('../logger/index.js', () => ({
  logger: { child: vi.fn(() => childLog) },
}))

// assertSafeUrl has its own SSRF tests and does real DNS; mock it here so these
// tests stay offline and we can drive the "blocked at send time" path.
const { assertSafeUrlMock } = vi.hoisted(() => ({ assertSafeUrlMock: vi.fn() }))
vi.mock('../../net/assertSafeUrl.js', () => ({ assertSafeUrl: assertSafeUrlMock }))

import crypto from 'node:crypto'

const { sendWebhook } = await import('./WebhookSender.js')

function makeResponse(status: number, body = '', statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
  }
}

describe('sendWebhook', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    childLog.debug.mockClear()
    childLog.info.mockClear()
    assertSafeUrlMock.mockReset()
    assertSafeUrlMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('disallows following redirects (SSRF: a 3xx to an internal IP must not be followed)', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendWebhook({ url: 'https://example.com/x', payload: {}, authType: null, authToken: null })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })

  it('re-validates the URL right before sending (closes the config→send TOCTOU window)', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendWebhook({ url: 'https://example.com/x', payload: {}, authType: null, authToken: null })
    expect(assertSafeUrlMock).toHaveBeenCalledWith('https://example.com/x', expect.any(String))
  })

  it('does not send when the URL now resolves to a blocked address', async () => {
    assertSafeUrlMock.mockRejectedValueOnce(new Error('blocked: private address'))
    await expect(
      sendWebhook({ url: 'https://rebound.example.com/x', payload: {}, authType: null, authToken: null }),
    ).rejects.toThrow(/blocked/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs the body with HMAC-SHA256 when WEBHOOK_SIGNING_SECRET is set', async () => {
    vi.stubEnv('WEBHOOK_SIGNING_SECRET', 'top-secret')
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendWebhook({ url: 'https://example.com/x', payload: { a: 1 }, authType: null, authToken: null })

    const headers = fetchMock.mock.calls[0][1].headers
    const body = fetchMock.mock.calls[0][1].body as string
    const ts = headers['X-Webhook-Timestamp']
    expect(ts).toBeTruthy()
    const expected = 'sha256=' + crypto.createHmac('sha256', 'top-secret').update(`${ts}.${body}`).digest('hex')
    expect(headers['X-Signature-256']).toBe(expected)
  })

  it('omits the signature header when no signing secret is configured', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendWebhook({ url: 'https://example.com/x', payload: {}, authType: null, authToken: null })
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['X-Signature-256']).toBeUndefined()
  })

  it('sends without Authorization header when authToken is null', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, 'ok-body'))

    await sendWebhook({
      url: 'https://example.com/hook',
      payload: { foo: 'bar' },
      authType: null,
      authToken: null,
    })

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/hook', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
    }))
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Accept']).toBe('application/json')
    expect(headers['Authorization']).toBeUndefined()
  })

  it('uses Bearer Authorization when authType is bearer', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: 'bearer',
      authToken: 'abc',
    })
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Authorization']).toBe('Bearer abc')
  })

  it('uses Api-Key Authorization when authType is api_key', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: 'api_key',
      authToken: 'k1',
    })
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Authorization']).toBe('Api-Key k1')
  })

  it('defaults to Bearer when authType is null but token present', async () => {
    fetchMock.mockResolvedValue(makeResponse(200))
    await sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: null,
      authToken: 'tok',
    })
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Authorization']).toBe('Bearer tok')
  })

  it('returns the status and body on success', async () => {
    fetchMock.mockResolvedValue(makeResponse(202, 'accepted', 'Accepted'))
    const result = await sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: null,
      authToken: null,
    })
    expect(result).toEqual({ status: 202, body: 'accepted' })
  })

  it('attaches the status code to the thrown error on failure', async () => {
    fetchMock.mockResolvedValue(makeResponse(503, 'down', 'Service Unavailable'))
    await expect(sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: null,
      authToken: null,
    })).rejects.toMatchObject({ status: 503 })
  })

  it('attaches the response body to the thrown error on failure', async () => {
    fetchMock.mockResolvedValue(makeResponse(422, '{"code":"bad"}', 'Unprocessable Entity'))
    await expect(sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: null,
      authToken: null,
    })).rejects.toMatchObject({ status: 422, body: '{"code":"bad"}' })
  })

  it('throws when response is not ok and includes body excerpt', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'server exploded', 'Internal Server Error'))
    await expect(sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: null,
      authToken: null,
    })).rejects.toThrow(/Webhook failed: 500 Internal Server Error — server exploded/)
  })

  it('throws without body fragment when response body is empty', async () => {
    fetchMock.mockResolvedValue(makeResponse(404, '', 'Not Found'))
    await expect(sendWebhook({
      url: 'https://example.com/x',
      payload: {},
      authType: null,
      authToken: null,
    })).rejects.toThrow('Webhook failed: 404 Not Found')
  })

  it('handles response.text() rejection by treating body as empty', async () => {
    const res = {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn().mockRejectedValue(new Error('decode')),
    }
    fetchMock.mockResolvedValue(res)
    await expect(sendWebhook({
      url: 'https://example.com/x',
      payload: { a: 1 },
      authType: null,
      authToken: null,
    })).resolves.toEqual({ status: 200, body: '' })
    expect(childLog.info).toHaveBeenCalledWith('response', expect.objectContaining({ status: 200, body: '' }))
  })

  it('truncates very long error body to 300 chars', async () => {
    const long = 'a'.repeat(500)
    fetchMock.mockResolvedValue(makeResponse(500, long, 'Internal Server Error'))
    try {
      await sendWebhook({
        url: 'https://example.com/x',
        payload: {},
        authType: null,
        authToken: null,
      })
      throw new Error('expected to throw')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('Webhook failed: 500')
      expect(msg.length).toBeLessThan(400)
    }
  })
})
