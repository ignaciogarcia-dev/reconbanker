import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const handleUpgrade = vi.fn()
const wssClose = vi.fn()

vi.mock('ws', () => {
  class WebSocketServer {
    handleUpgrade = handleUpgrade
    close = wssClose
    constructor(_opts: unknown) {}
  }
  class WebSocket { static OPEN = 1 }
  return { WebSocketServer, WebSocket }
})

const { RealtimeGateway } = await import('./RealtimeGateway.js')
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'
import type { RealtimeBus } from '../../shared/infrastructure/realtime/RealtimeBus.js'
import type { SystemEvent } from '../../shared/infrastructure/realtime/events.js'

type Handlers = Record<string, (...a: unknown[]) => void>
function fakeWs(readyState = 1) {
  const handlers: Handlers = {}
  return {
    readyState, OPEN: 1,
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => { handlers[ev] = cb }),
    send: vi.fn(),
    close: vi.fn(),
    fire: (ev: string, ...a: unknown[]) => handlers[ev]?.(...a),
  }
}

function fakeSocket() {
  return { write: vi.fn(), destroy: vi.fn() } as unknown as Duplex & { write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
}

function req(url: string, protocol?: string): IncomingMessage {
  return { url, headers: protocol ? { 'sec-websocket-protocol': protocol } : {} } as unknown as IncomingMessage
}

function setup(verify: ITokenIssuer['verify'] = () => ({ sub: 'u-1', email: '', scope: 'ws' })) {
  const tokenIssuer = { issue: vi.fn(), verify: vi.fn(verify) } as unknown as ITokenIssuer
  let routeCb: ((e: SystemEvent) => void) | undefined
  const dispose = vi.fn(async () => {})
  const bus = {
    subscribeAllUserEvents: vi.fn((cb: (e: SystemEvent) => void) => { routeCb = cb; return dispose }),
  } as unknown as RealtimeBus
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
  const gateway = new RealtimeGateway(tokenIssuer, bus, logger as never)
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
})
