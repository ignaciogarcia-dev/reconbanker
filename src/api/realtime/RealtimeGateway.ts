import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'
import type { RealtimeBus } from '../../shared/infrastructure/realtime/RealtimeBus.js'
import type { SystemEvent } from '../../shared/infrastructure/realtime/events.js'
import type { ILogger } from '../../shared/logger/ILogger.js'

const WS_PATH = '/realtime'
const SUBPROTOCOL = 'realtime.v1'
// Drop a frame larger than this on the floor: the channel is server→client only,
// so the client never has a legitimate reason to send anything sizeable.
const MAX_PAYLOAD_BYTES = 64 * 1024
// Shed a consumer that has let this many bytes queue up rather than buffer events
// in memory unboundedly behind a stalled socket.
const MAX_BUFFERED_BYTES = 1024 * 1024
const HEARTBEAT_MS = 30_000

// `ws` does not type the per-socket liveness flag we attach for the heartbeat.
type LiveSocket = WebSocket & { isAlive?: boolean }

// The ws ticket travels as the second WebSocket subprotocol so it never lands in the URL or server logs and Redis pub/sub upstream fans out so each instance routes only to the sockets it holds
export class RealtimeGateway {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })
  private readonly byUser = new Map<string, Set<WebSocket>>()
  private disposeBus?: () => Promise<void>
  private heartbeat?: ReturnType<typeof setInterval>

  constructor(
    private readonly tokenIssuer: ITokenIssuer,
    private readonly bus: RealtimeBus,
    private readonly logger?: ILogger,
    // When set, browser upgrades whose Origin is not listed are rejected. Empty/undefined
    // disables the check so non-browser clients (which omit Origin) keep working.
    private readonly allowedOrigins?: string[],
  ) {}

  attach(server: HttpServer): void {
    server.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head))
    this.disposeBus = this.bus.subscribeAllUserEvents((event) => this.route(event))
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS)
    // Don't keep the event loop alive just for the heartbeat.
    this.heartbeat.unref?.()
    this.logger?.info('realtime gateway attached', { path: WS_PATH })
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    await this.disposeBus?.()
    for (const set of this.byUser.values()) for (const ws of set) ws.close()
    this.wss.close()
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (new URL(req.url ?? '', 'http://localhost').pathname !== WS_PATH) {
      // No other upgrade handler exists so close rather than leave the client hanging
      socket.destroy()
      return
    }
    if (!this.originAllowed(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    const userId = this.authenticate(req)
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.register(userId, ws)
    })
  }

  // Defence-in-depth alongside the bearer ticket: reject cross-origin browsers up front.
  // A missing Origin (non-browser clients) is allowed; the ticket still gates access.
  private originAllowed(req: IncomingMessage): boolean {
    if (!this.allowedOrigins || this.allowedOrigins.length === 0) return true
    const origin = req.headers.origin
    if (!origin) return true
    return this.allowedOrigins.includes(origin)
  }

  // The ticket is the second offered subprotocol after `realtime.v1`
  private authenticate(req: IncomingMessage): string | null {
    const raw = req.headers['sec-websocket-protocol']
    if (!raw) return null
    const protocols = String(raw).split(',').map((p) => p.trim())
    if (protocols[0] !== SUBPROTOCOL || !protocols[1]) return null
    const payload = this.tokenIssuer.verify(protocols[1])
    if (!payload || payload.scope !== 'ws') return null
    return payload.sub
  }

  private register(userId: string, ws: WebSocket): void {
    let set = this.byUser.get(userId)
    if (!set) { set = new Set(); this.byUser.set(userId, set) }
    set.add(ws)
    ;(ws as LiveSocket).isAlive = true
    ws.on('pong', () => { (ws as LiveSocket).isAlive = true })
    // Unidirectional channel: any client frame is protocol abuse, so hang up (1003).
    ws.on('message', () => ws.close(1003))
    ws.on('close', () => {
      set!.delete(ws)
      if (set!.size === 0) this.byUser.delete(userId)
    })
    ws.on('error', () => ws.close())
  }

  // Ping every live socket each beat; reap any that missed the previous ping's pong.
  private beat(): void {
    for (const set of this.byUser.values()) {
      for (const ws of set) {
        const live = ws as LiveSocket
        if (live.isAlive === false) { ws.terminate(); continue }
        live.isAlive = false
        ws.ping()
      }
    }
  }

  private route(event: SystemEvent): void {
    const set = this.byUser.get(event.userId)
    if (!set) return
    const payload = JSON.stringify(event)
    for (const ws of set) {
      if (ws.readyState !== ws.OPEN) continue
      // Drop a backed-up consumer instead of letting events pile up in its send buffer.
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) { ws.close(1013); continue }
      ws.send(payload)
    }
  }
}
