import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'
import type { RealtimeBus } from '../../shared/infrastructure/realtime/RealtimeBus.js'
import type { SystemEvent } from '../../shared/infrastructure/realtime/events.js'
import type { ILogger } from '../../shared/logger/ILogger.js'

const WS_PATH = '/realtime'
const SUBPROTOCOL = 'realtime.v1'

// The ws ticket travels as the second WebSocket subprotocol so it never lands in the URL or server logs and Redis pub/sub upstream fans out so each instance routes only to the sockets it holds
export class RealtimeGateway {
  private readonly wss = new WebSocketServer({ noServer: true })
  private readonly byUser = new Map<string, Set<WebSocket>>()
  private disposeBus?: () => Promise<void>

  constructor(
    private readonly tokenIssuer: ITokenIssuer,
    private readonly bus: RealtimeBus,
    private readonly logger?: ILogger,
  ) {}

  attach(server: HttpServer): void {
    server.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head))
    this.disposeBus = this.bus.subscribeAllUserEvents((event) => this.route(event))
    this.logger?.info('realtime gateway attached', { path: WS_PATH })
  }

  async close(): Promise<void> {
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
    ws.on('close', () => {
      set!.delete(ws)
      if (set!.size === 0) this.byUser.delete(userId)
    })
    ws.on('error', () => ws.close())
  }

  private route(event: SystemEvent): void {
    const set = this.byUser.get(event.userId)
    if (!set) return
    const payload = JSON.stringify(event)
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(payload)
    }
  }
}
