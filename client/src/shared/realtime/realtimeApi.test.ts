import { describe, it, expect, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/msw/server'
import { getRealtimeTicket, realtimeUrl, REALTIME_SUBPROTOCOL } from './realtimeApi'

describe('realtimeApi', () => {
  const original = window.location

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, configurable: true })
  })

  it('exchanges the session for a ws ticket', async () => {
    server.use(
      http.post('/api/realtime/ticket', () => HttpResponse.json({ ticket: 'tkt-1', ttl_seconds: 30 }))
    )
    await expect(getRealtimeTicket()).resolves.toEqual({ ticket: 'tkt-1', ttl_seconds: 30 })
  })

  it('builds a ws:// url on http and wss:// on https', () => {
    Object.defineProperty(window, 'location', {
      value: { protocol: 'http:', host: 'example.test:3000' }, configurable: true,
    })
    expect(realtimeUrl()).toBe('ws://example.test:3000/realtime')

    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', host: 'example.test' }, configurable: true,
    })
    expect(realtimeUrl()).toBe('wss://example.test/realtime')
  })

  it('exposes the negotiated subprotocol', () => {
    expect(REALTIME_SUBPROTOCOL).toBe('realtime.v1')
  })
})
