import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const handleUpgrade = vi.fn()
const wssClose = vi.fn()
let wssOpts: Record<string, unknown> | undefined

vi.mock('ws', () => {
  class WebSocketServer {
    handleUpgrade = handleUpgrade
    close = wssClose
    constructor(opts: Record<string, unknown>) { wssOpts = opts }
  }
  class WebSocket { static OPEN = 1 }
  return { WebSocketServer, WebSocket }
})

const { RealtimeGateway } = await import('./RealtimeGateway.js')
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'
import type { RealtimeBus } from '../../shared/infrastructure/realtime/RealtimeBus.js'
import type { SystemEvent } from '../../shared/infrastructure/realtime/events.js'

type Handlers = Record<string, (...a: unknown[]) => void>
function fakeWs(readyState = 1, bufferedAmount = 0) {
  const handlers: Handlers = {}
  return {
    readyState, OPEN: 1, bufferedAmount,
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => { handlers[ev] = cb }),
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    fire: (ev: string, ...a: unknown[]) => handlers[ev]?.(...a),
  }
}

function fakeSocket() {
  return { write: vi.fn(), destroy: vi.fn() } as unknown as Duplex & { write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
}

function req(url: string, protocol?: string, origin?: string): IncomingMessage {
  const headers: Record<string, string> = {}
  if (protocol) headers['sec-websocket-protocol'] = protocol
  if (origin) headers.origin = origin
  return { url, headers } as unknown as IncomingMessage
}

function setup(
  verify: ITokenIssuer['verify'] = () => ({ sub: 'u-1', email: '', scope: 'ws' }),
  allowedOrigins?: string[],
) {
  const tokenIssuer = { issue: vi.fn(), verify: vi.fn(verify) } as unknown as ITokenIssuer
  let routeCb: ((e: SystemEvent) => void) | undefined
  const dispose = vi.fn(async () => {})
  const bus = {
    subscribeAllUserEvents: vi.fn((cb: (e: SystemEvent) => void) => { routeCb = cb; return dispose }),
  } as unknown as RealtimeBus
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
  const gateway = new RealtimeGateway(tokenIssuer, bus, logger as never, allowedOrigins)
  const server = { on: vi.fn() }
  gateway.attach(server as never)
  const upgrade = server.on.mock.calls[0][1] as (r: IncomingMessage, s: Duplex, h: Buffer) => void
  return { gateway, upgrade, dispose, bus, getRoute: () => routeCb! }
}

const head = Buffer.alloc(0)

describe('RealtimeGateway', () => {
  beforeEach(() => { handleUpgrade.mockReset(); wssClose.mockReset() })

  it('destroys sockets upgrading on a foreign path', () => {
    const { upgrade } = setup()
    const socket = fakeSocket()
    upgrade(req('/other'), socket, head)
    expect(socket.destroy).toHaveBeenCalled()
    expect(handleUpgrade).not.toHaveBeenCalled()
  })

  it('rejects upgrades without a valid ticket', () => {
    const cases: Array<string | undefined> = [
      undefined,                 // no protocol header
      'wrong.proto, ticket',     // wrong subprotocol
      'realtime.v1',             // missing ticket
    ]
    for (const proto of cases) {
      const { upgrade } = setup()
      const socket = fakeSocket()
      upgrade(req('/realtime', proto), socket, head)
      expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 401 Unauthorized\r\n\r\n')
      expect(socket.destroy).toHaveBeenCalled()
    }
  })

  it('rejects when the token is invalid or not ws-scoped', () => {
    for (const verify of [() => null, () => ({ sub: 'u-1', email: '', scope: 'api' })] as ITokenIssuer['verify'][]) {
      const { upgrade } = setup(verify)
      const socket = fakeSocket()
      upgrade(req('/realtime', 'realtime.v1, tkt'), socket, head)
      expect(socket.destroy).toHaveBeenCalled()
      expect(handleUpgrade).not.toHaveBeenCalled()
    }
  })

  it('upgrades, registers a socket, and routes events to it', () => {
    const { upgrade, getRoute } = setup()
    const ws = fakeWs()
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(ws))
    upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)

    getRoute()({ type: 'session.started', userId: 'u-1', accountId: 'a-1', occurredAt: 'now' })
    expect(ws.send).toHaveBeenCalledTimes(1)

    // Unknown user and closed sockets receive nothing.
    getRoute()({ type: 'session.started', userId: 'other', accountId: 'a-1', occurredAt: 'now' })
    const closedWs = fakeWs(0)
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(closedWs))
    upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)
    getRoute()({ type: 'session.started', userId: 'u-1', accountId: 'a-1', occurredAt: 'now' })
    expect(closedWs.send).not.toHaveBeenCalled()
  })

  it('cleans up the user set on socket close and closes on error', () => {
    const { upgrade, getRoute } = setup()
    const ws = fakeWs()
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(ws))
    upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)

    ws.fire('error')
    expect(ws.close).toHaveBeenCalled()

    ws.fire('close')
    // After the last socket closes the user entry is dropped, so routing sends nothing.
    const ws2 = fakeWs()
    getRoute()({ type: 'session.started', userId: 'u-1', accountId: 'a-1', occurredAt: 'now' })
    expect(ws2.send).not.toHaveBeenCalled()
  })

  it('disposes the bus subscription and closes sockets on close()', async () => {
    const { gateway, upgrade, dispose } = setup()
    const ws = fakeWs()
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(ws))
    upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)

    await gateway.close()
    expect(dispose).toHaveBeenCalled()
    expect(ws.close).toHaveBeenCalled()
    expect(wssClose).toHaveBeenCalled()
  })

  it('caps the inbound frame size', () => {
    setup()
    expect(wssOpts?.maxPayload).toBe(64 * 1024)
  })

  it('closes the socket if the client sends a message (unidirectional channel)', () => {
    const { upgrade } = setup()
    const ws = fakeWs()
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(ws))
    upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)

    ws.fire('message', Buffer.from('anything'))
    expect(ws.close).toHaveBeenCalledWith(1003)
  })

  it('skips sending to a socket that is backed up (backpressure)', () => {
    const { upgrade, getRoute } = setup()
    const slow = fakeWs(1, 2 * 1024 * 1024) // bufferedAmount well over the cap
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(slow))
    upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)

    getRoute()({ type: 'session.started', userId: 'u-1', accountId: 'a-1', occurredAt: 'now' })
    expect(slow.send).not.toHaveBeenCalled()
  })

  it('skips the Origin check when no allowlist is configured', () => {
    // resolveCorsOrigins() returns [] in production without CORS_ORIGINS set.
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(fakeWs()))
    const { upgrade } = setup(undefined, [])
    upgrade(req('/realtime', 'realtime.v1, tkt', 'https://anything.example.com'), fakeSocket(), head)
    expect(handleUpgrade).toHaveBeenCalledTimes(1)
  })

  it('rejects an upgrade whose Origin is not allow-listed', () => {
    const { upgrade } = setup(undefined, ['https://app.example.com'])
    const socket = fakeSocket()
    upgrade(req('/realtime', 'realtime.v1, tkt', 'https://evil.example.com'), socket, head)
    expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 403 Forbidden\r\n\r\n')
    expect(socket.destroy).toHaveBeenCalled()
    expect(handleUpgrade).not.toHaveBeenCalled()
  })

  it('accepts an allow-listed Origin and a request without one', () => {
    handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(fakeWs()))
    const allowed = setup(undefined, ['https://app.example.com'])
    allowed.upgrade(req('/realtime', 'realtime.v1, tkt', 'https://app.example.com'), fakeSocket(), head)
    expect(handleUpgrade).toHaveBeenCalledTimes(1)

    // Non-browser clients send no Origin header and must still connect.
    handleUpgrade.mockClear()
    const noOrigin = setup(undefined, ['https://app.example.com'])
    noOrigin.upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)
    expect(handleUpgrade).toHaveBeenCalledTimes(1)
  })

  it('pings live sockets and terminates ones that miss a pong', () => {
    vi.useFakeTimers()
    try {
      const { gateway, upgrade } = setup()
      const ws = fakeWs()
      handleUpgrade.mockImplementation((_r, _s, _h, cb) => cb(ws))
      upgrade(req('/realtime', 'realtime.v1, tkt'), fakeSocket(), head)

      // First beat: still alive from the open, so it gets pinged.
      vi.advanceTimersByTime(30_000)
      expect(ws.ping).toHaveBeenCalledTimes(1)
      expect(ws.terminate).not.toHaveBeenCalled()

      // A pong arrives, keeping it alive across the next beat.
      ws.fire('pong')
      vi.advanceTimersByTime(30_000)
      expect(ws.terminate).not.toHaveBeenCalled()
      expect(ws.ping).toHaveBeenCalledTimes(2)

      // No pong this time: the next beat reaps it.
      vi.advanceTimersByTime(30_000)
      expect(ws.terminate).toHaveBeenCalledTimes(1)

      return gateway.close()
    } finally {
      vi.useRealTimers()
    }
  })
})
