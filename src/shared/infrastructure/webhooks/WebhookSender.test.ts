import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const childLog = {
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  child: vi.fn(),
}
childLog.child.mockReturnValue(childLog)

vi.mock('../logger/index.js', () => ({
  logger: { child: vi.fn(() => childLog) },
}))

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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
