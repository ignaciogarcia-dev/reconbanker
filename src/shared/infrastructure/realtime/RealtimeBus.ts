import { Redis } from 'ioredis'
import { redis } from '../queues/QueueRegistry.js'
import { SystemEvent } from './events.js'

// `next` blocks one window and returns the code or null on timeout while `close` tears down the stream and connection
export interface OtpWaiter {
  next(windowMs: number): Promise<string | null>
  close(): Promise<void>
}

// Pub sub broadcasts dashboard events to every gateway instance while Redis Streams give durable acked point to point delivery for OTP and the notifier and blocking reads always get a duplicated connection

const OTP_GROUP = 'otp'
const NOTIFY_STREAM = 'notify-stream'
const NOTIFY_GROUP = 'notifier'

function userChannel(userId: string): string {
  return `events:user:${userId}`
}
function otpStream(reqId: string): string {
  return `otp:req:${reqId}`
}

async function ensureGroupAt(conn: Redis, stream: string, group: string, start: '0' | '$'): Promise<void> {
  try {
    await conn.xgroup('CREATE', stream, group, start, 'MKSTREAM')
  } catch (err) {
    // BUSYGROUP means the group already exists and any other error is real
    if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err
  }
}

export class RealtimeBus {
  // Resolved lazily so merely importing this module never touches the shared Redis client
  constructor(private readonly injected?: Redis) {}
  private get conn(): Redis {
    return this.injected ?? redis
  }

  // Dashboard fan-out over pub sub

  async publishUserEvent(event: SystemEvent): Promise<void> {
    await this.conn.publish(userChannel(event.userId), JSON.stringify(event))
  }

  // Subscribes to ALL user channels on a dedicated connection and returns a disposer for the subscriber connection
  subscribeAllUserEvents(onEvent: (event: SystemEvent) => void): () => Promise<void> {
    const sub = this.conn.duplicate()
    void sub.psubscribe('events:user:*')
    sub.on('pmessage', (_pattern, _channel, message) => {
      try {
        onEvent(JSON.parse(message) as SystemEvent)
      } catch {
        // Drop malformed payloads rather than crash the gateway
      }
    })
    return async () => {
      await sub.quit().catch(() => {})
    }
  }

  // OTP delivery on a per-request stream

  // One long-lived waiter per assistance request created at '0' on its own connection so a code submitted between windows is never lost
  async openOtpWaiter(reqId: string): Promise<OtpWaiter> {
    const stream = otpStream(reqId)
    const conn = this.conn.duplicate()
    await ensureGroupAt(conn, stream, OTP_GROUP, '0')
    return {
      async next(windowMs: number): Promise<string | null> {
        const res = (await conn.xreadgroup(
          'GROUP', OTP_GROUP, `c-${reqId}`,
          'COUNT', 1, 'BLOCK', windowMs,
          'STREAMS', stream, '>',
        )) as [string, [string, string[]][]][] | null
        const entries = res?.[0]?.[1]
        if (!entries || entries.length === 0) return null // window elapsed with no code
        const [entryId, fields] = entries[0]
        await conn.xack(stream, OTP_GROUP, entryId).catch(() => {})
        return fieldValue(fields, 'code') ?? null
      },
      async close(): Promise<void> {
        // Drop the single-shot stream so nothing lingers in Redis
        await conn.del(stream).catch(() => {})
        await conn.quit().catch(() => {})
      },
    }
  }

  // MAXLEN keeps the stream tiny and the code is never persisted anywhere else
  async submitOtp(reqId: string, code: string): Promise<void> {
    await this.conn.xadd(otpStream(reqId), 'MAXLEN', '~', 5, '*', 'code', code)
  }

  // Notifier stream

  // MAXLEN caps the stream because XACK clears the PEL but does not trim entries
  async enqueueNotification(event: SystemEvent): Promise<void> {
    await this.conn.xadd(NOTIFY_STREAM, 'MAXLEN', '~', 5_000, '*', 'event', JSON.stringify(event))
  }

  // Acks ONLY on success and reclaims stale pending entries via XAUTOCLAIM each iteration for at-least-once delivery
  async consumeNotifications(
    consumer: string,
    handler: (event: SystemEvent) => Promise<void>,
    signal: { stopped: boolean },
    reclaimIdleMs = 60_000,
  ): Promise<void> {
    const conn = this.conn.duplicate()
    await ensureGroupAt(conn, NOTIFY_STREAM, NOTIFY_GROUP, '$')

    const process = async (entries: [string, string[]][]): Promise<void> => {
      for (const [entryId, fields] of entries) {
        const raw = fieldValue(fields, 'event')
        if (raw) {
          try { await handler(JSON.parse(raw) as SystemEvent) }
          catch { continue } // left un-acked so XAUTOCLAIM redelivers it later
        }
        await conn.xack(NOTIFY_STREAM, NOTIFY_GROUP, entryId).catch(() => {})
      }
    }

    try {
      while (!signal.stopped) {
        // Reclaim stale pending entries from failed deliveries or crashed consumers
        const claimed = (await conn.xautoclaim(
          NOTIFY_STREAM, NOTIFY_GROUP, consumer, reclaimIdleMs, '0', 'COUNT', 10,
        ).catch(() => null)) as [string, [string, string[]][], string[]] | null
        if (claimed?.[1]?.length) await process(claimed[1])

        const res = (await conn.xreadgroup(
          'GROUP', NOTIFY_GROUP, consumer,
          'COUNT', 10, 'BLOCK', 5_000,
          'STREAMS', NOTIFY_STREAM, '>',
        )) as [string, [string, string[]][]][] | null
        if (!res || res.length === 0) continue
        for (const [, entries] of res) await process(entries)
      }
    } finally {
      await conn.quit().catch(() => {})
    }
  }
}

function fieldValue(fields: string[], key: string): string | undefined {
  // Redis returns stream fields as a flat alternating key value array
  for (let i = 0; i < fields.length - 1; i += 2) {
    if (fields[i] === key) return fields[i + 1]
  }
  return undefined
}

// Shared singleton used across the app
export const realtimeBus = new RealtimeBus()
