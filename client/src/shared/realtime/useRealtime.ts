import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accountsQueryKey } from '@/features/account/hooks/useAccounts'
import { getPendingAssistance } from '@/features/account/api/assistance'
import { getRealtimeTicket, realtimeUrl, REALTIME_SUBPROTOCOL } from './realtimeApi'

export interface SystemEvent {
  type:
    | 'assistance.requested'
    | 'assistance.fulfilled'
    | 'assistance.cancelled'
    | string
  userId: string
  accountId: string
  data?: Record<string, unknown> & {
    requestId?: string
    descriptor?: { length: number; type: 'numeric' | 'alphanumeric'; purpose?: string }
  }
  occurredAt: string
}

export interface PendingAssistance {
  requestId?: string
  descriptor: { length: number; type: 'numeric' | 'alphanumeric'; purpose?: string }
}

const DEFAULT_DESCRIPTOR: PendingAssistance['descriptor'] = { length: 6, type: 'numeric' }

// Single app WebSocket that surfaces per-account OTP assistance state and reconnects with capped backoff.
// `accountIds` seeds the map from the OTP endpoint so a request raised before this socket connected
// (e.g. during a background/scheduled login) still surfaces, since the live event is never replayed.
export function useRealtime(accountIds: readonly string[] = []) {
  const qc = useQueryClient()
  // A Map keeps server-provided account ids as plain entries, never object property
  // keys, so hostile ids like '__proto__' cannot pollute prototypes (CodeQL js/remote-property-injection)
  const [assistance, setAssistance] = useState<ReadonlyMap<string, PendingAssistance>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)
  const closedRef = useRef(false)
  const attemptRef = useRef(0)

  const clearAccount = useCallback((accountId: string) => {
    setAssistance((prev) => {
      if (!prev.has(accountId)) return prev
      const next = new Map(prev)
      next.delete(accountId)
      return next
    })
  }, [])

  // Hydrate pending assistance for the known accounts on load. Only adds entries the live socket
  // hasn't already set, so a slow GET never resurrects an account just cleared by a fulfilled event.
  const idsKey = accountIds.join(',')
  useEffect(() => {
    if (!idsKey) return
    let cancelled = false
    const ids = idsKey.split(',')
    void Promise.all(
      ids.map((id) => getPendingAssistance(id).then((pending) => ({ id, pending })).catch(() => null)),
    ).then((results) => {
      if (cancelled) return
      const pending = results.flatMap((r) => (r?.pending ? [{ id: r.id, dto: r.pending }] : []))
      if (pending.length === 0) return
      setAssistance((prev) => {
        const additions = pending.filter((p) => !prev.has(p.id))
        if (additions.length === 0) return prev
        const next = new Map(prev)
        for (const p of additions) next.set(p.id, { requestId: p.dto.id, descriptor: p.dto.descriptor })
        return next
      })
    })
    return () => { cancelled = true }
  }, [idsKey])

  useEffect(() => {
    // Effect-local flag stops an async connect() from keeping a socket after teardown since the shared closedRef only gates reconnects
    let cancelled = false
    closedRef.current = false
    let reconnectTimer: ReturnType<typeof setTimeout>

    const connect = async () => {
      /* v8 ignore next -- re-entry guard only trips when a queued reconnect fires after teardown */
      if (cancelled || closedRef.current) return
      try {
        const { ticket } = await getRealtimeTicket()
        if (cancelled) return // torn down while fetching the ticket
        const ws = new WebSocket(realtimeUrl(), [REALTIME_SUBPROTOCOL, ticket])
        wsRef.current = ws

        ws.onopen = () => { attemptRef.current = 0 }

        ws.onmessage = (ev) => {
          let event: SystemEvent
          try { event = JSON.parse(ev.data) } catch { return }
          if (event.type === 'assistance.requested') {
            qc.invalidateQueries({ queryKey: accountsQueryKey })
            setAssistance((prev) => {
              const next = new Map(prev)
              next.set(event.accountId, {
                requestId: event.data?.requestId,
                descriptor: event.data?.descriptor ?? DEFAULT_DESCRIPTOR,
              })
              return next
            })
          } else if (event.type === 'assistance.fulfilled' || event.type === 'assistance.cancelled') {
            qc.invalidateQueries({ queryKey: accountsQueryKey })
            clearAccount(event.accountId)
          }
        }

        ws.onclose = () => { scheduleReconnect() }
        ws.onerror = () => { ws.close() }
      } catch {
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      /* v8 ignore next -- guard only trips when a close fires after teardown, which the cleanup prevents */
      if (cancelled || closedRef.current) return
      // Exponential backoff with jitter to avoid a reconnect thundering herd
      const base = Math.min(1000 * 2 ** attemptRef.current, 30_000)
      const delay = base / 2 + Math.random() * (base / 2)
      attemptRef.current += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    void connect()

    return () => {
      cancelled = true
      closedRef.current = true
      clearTimeout(reconnectTimer)
      // Close whatever socket this effect run actually created
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [qc, clearAccount])

  return { assistance, clearAccount }
}
