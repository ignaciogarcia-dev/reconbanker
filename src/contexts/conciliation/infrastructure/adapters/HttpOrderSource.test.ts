import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// assertSafeUrl has its own SSRF tests and does real DNS; mock it here so these
// tests stay offline and we can drive the "blocked at send time" path.
const { assertSafeUrlMock } = vi.hoisted(() => ({ assertSafeUrlMock: vi.fn() }))
vi.mock('../../../../shared/net/assertSafeUrl.js', () => ({ assertSafeUrl: assertSafeUrlMock }))

import { HttpOrderSource } from './HttpOrderSource.js'
import { ValidationError } from '../../../../shared/errors/index.js'

type FetchMock = ReturnType<typeof vi.fn>

function makeResponse(opts: {
  ok?: boolean
  status?: number
  statusText?: string
  contentType?: string | null
  json?: () => Promise<any>
  text?: () => Promise<string>
}): any {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? opts.contentType ?? null : null) },
    json: opts.json ?? (async () => ({})),
    text: opts.text ?? (async () => ''),
  }
}

describe('HttpOrderSource', () => {
  let fetchMock: FetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    assertSafeUrlMock.mockReset()
    assertSafeUrlMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('re-validates the endpoint right before polling (closes the config→poll TOCTOU window)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ contentType: 'application/json', json: async () => [] }))
    const src = new HttpOrderSource()
    await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://example.com/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(assertSafeUrlMock).toHaveBeenCalledWith('https://example.com/pending', expect.any(String))
  })

  it('does not poll when the endpoint now resolves to a blocked address', async () => {
    assertSafeUrlMock.mockRejectedValueOnce(new Error('blocked: private address'))
    const src = new HttpOrderSource()
    await expect(
      src.fetch({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://rebound.example.com/pending',
        pollingMethod: 'GET',
        pollingBody: null,
        authType: null,
        authToken: null,
      } as any),
    ).rejects.toThrow(/blocked/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('disallows following redirects (SSRF: a polling endpoint must not 3xx us to an internal IP)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ contentType: 'application/json', json: async () => [] }))
    const src = new HttpOrderSource()
    await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://example.com/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })

  it('returns [] without calling fetch when no endpoint is configured', async () => {
    const src = new HttpOrderSource()
    const out = await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: null,
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(out).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes a GET request without auth header when no authToken', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'application/json',
        json: async () => [],
      }),
    )
    const src = new HttpOrderSource()
    await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.io/pending')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('sets Bearer authorization when authType is not api_key', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ contentType: 'application/json', json: async () => [] }),
    )
    const src = new HttpOrderSource()
    await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: 'bearer',
      authToken: 'tok',
    } as any)
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    })
  })

  it('sets Api-Key authorization when authType is api_key', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ contentType: 'application/json', json: async () => [] }),
    )
    const src = new HttpOrderSource()
    await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: 'api_key',
      authToken: 'tok',
    } as any)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Api-Key tok')
  })

  it('sends a POST body when pollingMethod is POST', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ contentType: 'application/json', json: async () => [] }),
    )
    const src = new HttpOrderSource()
    await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'POST',
      pollingBody: { q: 1 },
      authType: null,
      authToken: null,
    } as any)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ q: 1 }))
  })

  it('defaults pollingBody to {} when POST and no body is provided', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ contentType: 'application/json', json: async () => [] }),
    )
    const src = new HttpOrderSource()
    await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'POST',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({}))
  })

  it('throws including body snippet when response is not ok', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        contentType: 'text/plain',
        text: async () => 'boom',
      }),
    )
    const src = new HttpOrderSource()
    await expect(
      src.fetch({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://x.io/pending',
        pollingMethod: 'GET',
        pollingBody: null,
        authType: null,
        authToken: null,
      } as any),
    ).rejects.toThrow(/Polling failed: 500 Server Error \(content-type: text\/plain\) body: boom/)
  })

  it('throws on non-ok response with missing content-type and empty body', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        contentType: null,
        text: async () => '',
      }),
    )
    const src = new HttpOrderSource()
    await expect(
      src.fetch({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://x.io/pending',
        pollingMethod: 'GET',
        pollingBody: null,
        authType: null,
        authToken: null,
      } as any),
    ).rejects.toThrow(/Polling failed: 502 Bad Gateway \(content-type: \)$/)
  })

  it('throws when not ok and response.text() rejects', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        contentType: 'text/plain',
        text: async () => {
          throw new Error('read failed')
        },
      }),
    )
    const src = new HttpOrderSource()
    await expect(
      src.fetch({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://x.io/pending',
        pollingMethod: 'GET',
        pollingBody: null,
        authType: null,
        authToken: null,
      } as any),
    ).rejects.toThrow(/Polling failed: 500 Server Error \(content-type: text\/plain\)$/)
  })

  it('throws when content-type is not JSON', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'text/html',
        text: async () => '<html>nope</html>',
      }),
    )
    const src = new HttpOrderSource()
    await expect(
      src.fetch({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://x.io/pending',
        pollingMethod: 'GET',
        pollingBody: null,
        authType: null,
        authToken: null,
      } as any),
    ).rejects.toThrow(
      /Polling returned non-JSON response \(content-type: text\/html\) body: <html>nope<\/html>/,
    )
  })

  it('throws on non-JSON response when text() rejects', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'text/html',
        text: async () => {
          throw new Error('boom')
        },
      }),
    )
    const src = new HttpOrderSource()
    await expect(
      src.fetch({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://x.io/pending',
        pollingMethod: 'GET',
        pollingBody: null,
        authType: null,
        authToken: null,
      } as any),
    ).rejects.toThrow(/Polling returned non-JSON response \(content-type: text\/html\)$/)
  })

  it('parses array response', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'application/json',
        json: async () => [
          { external_id: 'o-1', amount: '10.5', currency: 'USD', name: 'Alice' },
          { external_id: 2, amount: 0, currency: 'EUR', name: 'Bob' },
        ],
      }),
    )
    const src = new HttpOrderSource()
    const out = await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(out).toEqual([
      { externalId: 'o-1', amount: 10.5, currency: 'USD', senderName: 'Alice' },
      { externalId: '2', amount: 0, currency: 'EUR', senderName: 'Bob' },
    ])
  })

  it('parses { data: [] } envelope response', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'application/json',
        json: async () => ({
          data: [{ external_id: 'o-1', amount: 1, currency: 'USD', name: 'Alice' }],
        }),
      }),
    )
    const src = new HttpOrderSource()
    const out = await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(out).toEqual([
      { externalId: 'o-1', amount: 1, currency: 'USD', senderName: 'Alice' },
    ])
  })

  it('throws ValidationError when response is neither array nor { data: [] }', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'application/json',
        json: async () => ({ unexpected: true }),
      }),
    )
    const src = new HttpOrderSource()
    await expect(
      src.fetch({
        accountId: 'acc-1',
        pendingOrdersEndpoint: 'https://x.io/pending',
        pollingMethod: 'GET',
        pollingBody: null,
        authType: null,
        authToken: null,
      } as any),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('skips orders missing required fields and warns via logger', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), child: vi.fn() }
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'application/json',
        json: async () => [
          { amount: 1, currency: 'USD', name: 'Alice' },
          { external_id: 'o-2', currency: 'USD', name: 'Bob' },
          { external_id: 'o-3', amount: 1, name: 'Bob' },
          { external_id: 'o-4', amount: 1, currency: 'USD' },
          { external_id: 'o-5', amount: 1, currency: 'USD', name: 'Eve' },
        ],
      }),
    )
    const src = new HttpOrderSource(logger as any)
    const out = await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(out).toEqual([
      { externalId: 'o-5', amount: 1, currency: 'USD', senderName: 'Eve' },
    ])
    expect(warn).toHaveBeenCalledTimes(4)
    expect(warn.mock.calls[0][0]).toBe('skipping invalid order')
  })

  it('skips orders whose amount is non-numeric or NaN', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), child: vi.fn() }
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'application/json',
        json: async () => [
          { external_id: 'o-1', amount: 'abc', currency: 'USD', name: 'Alice' },
          { external_id: 'o-2', amount: null, currency: 'USD', name: 'Bob' },
          { external_id: 'o-3', amount: '12.5', currency: 'USD', name: 'Eve' },
        ],
      }),
    )
    const src = new HttpOrderSource(logger as any)
    const out = await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(out).toEqual([
      { externalId: 'o-3', amount: 12.5, currency: 'USD', senderName: 'Eve' },
    ])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('silently skips bad orders when no logger is provided', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'application/json',
        json: async () => [{ amount: 1, currency: 'USD', name: 'Alice' }],
      }),
    )
    const src = new HttpOrderSource()
    const out = await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(out).toEqual([])
  })

  it('matches content-type case-insensitively', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        contentType: 'Application/JSON; charset=utf-8',
        json: async () => [],
      }),
    )
    const src = new HttpOrderSource()
    const out = await src.fetch({
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/pending',
      pollingMethod: 'GET',
      pollingBody: null,
      authType: null,
      authToken: null,
    } as any)
    expect(out).toEqual([])
  })
})
