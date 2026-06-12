import { httpClient } from '@/shared/http/client'

export interface RealtimeTicket {
  ticket: string
  ttl_seconds: number
}

// Exchanges the session Bearer for a short-lived ws-only ticket that never authorizes the REST API
export async function getRealtimeTicket(): Promise<RealtimeTicket> {
  const { data } = await httpClient.post<RealtimeTicket>('/realtime/ticket')
  return data
}

// Realtime always rides the page origin since `VITE_API_BASE_URL` only affects REST
export function realtimeUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/realtime`
}

export const REALTIME_SUBPROTOCOL = 'realtime.v1'
