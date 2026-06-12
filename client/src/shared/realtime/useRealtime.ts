import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accountsQueryKey } from '@/features/account/hooks/useAccounts'
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

// Single app WebSocket that surfaces per-account OTP assistance state and reconnects with capped backoff
export function useRealtime() {
  const qc = useQueryClient()
  const [assistance, setAssistance] = useState<Record<string, PendingAssistance>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const closedRef = useRef(false)
  const attemptRef = useRef(0)

  const clearAccount = useCallback((accountId: string) => {
    setAssistance((prev) => {
      if (!prev[accountId]) return prev
      const next = { ...prev }
      delete next[accountId]
      return next
    })
  }, [])

  useEffect(() => {
    // Effect-local flag stops an async connect() from keeping a socket after teardown since the shared closedRef only gates reconnects
    let cancelled = false
    closedRef.current = false
    let reconnectTimer: ReturnType<typeof setTimeout>

    const connect = async () => {
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
            setAssistance((prev) => ({
              ...prev,
              [event.accountId]: {
                requestId: event.data?.requestId,
                descriptor: event.data?.descriptor ?? DEFAULT_DESCRIPTOR,
              },
            }))
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
