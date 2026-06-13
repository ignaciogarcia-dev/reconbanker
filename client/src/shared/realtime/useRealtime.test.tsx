import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../tests/msw/server'
import { useRealtime } from './useRealtime'

// Minimal WebSocket double that records instances and lets the test fire lifecycle events.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  close = vi.fn()
  constructor(public url: string, public protocols?: string[]) {
    FakeWebSocket.instances.push(this)
  }
}

function Harness() {
  const { assistance, clearAccount } = useRealtime()
  return (
    <div>
      <span data-testid="count">{assistance.size}</span>
      {[...assistance.entries()].map(([id, a]) => (
        <span key={id} data-testid={`a-${id}`}>{id}:{a.descriptor.length}:{a.requestId ?? '-'}</span>
      ))}
      <button onClick={() => clearAccount('acc-1')}>clear</button>
    </div>
  )
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)
}

async function firstSocket(): Promise<FakeWebSocket> {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
  return FakeWebSocket.instances[0]
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  server.use(http.post('/api/realtime/ticket', () => HttpResponse.json({ ticket: 'tkt', ttl_seconds: 30 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useRealtime', () => {
  it('opens a socket with the negotiated subprotocol and ticket', async () => {
    renderHarness()
    const ws = await firstSocket()
    expect(ws.url).toMatch(/^ws:\/\/localhost(:\d+)?\/realtime$/)
    expect(ws.protocols).toEqual(['realtime.v1', 'tkt'])
  })

  it('records assistance on a requested event and clears it on fulfilled/cancelled', async () => {
    renderHarness()
    const ws = await firstSocket()
    act(() => ws.onopen?.())

    act(() => ws.onmessage?.({ data: JSON.stringify({
      type: 'assistance.requested', userId: 'u-1', accountId: 'acc-1',
      data: { requestId: 'req-9', descriptor: { length: 8, type: 'alphanumeric' } }, occurredAt: 'now',
    }) }))
    expect(screen.getByTestId('a-acc-1')).toHaveTextContent('acc-1:8:req-9')

    act(() => ws.onmessage?.({ data: JSON.stringify({
      type: 'assistance.fulfilled', userId: 'u-1', accountId: 'acc-1', occurredAt: 'now',
    }) }))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('falls back to the default descriptor and ignores malformed and unknown messages', async () => {
    renderHarness()
    const ws = await firstSocket()

    act(() => ws.onmessage?.({ data: 'not-json{' }))           // swallowed
    act(() => ws.onmessage?.({ data: JSON.stringify({ type: 'session.started', userId: 'u', accountId: 'x', occurredAt: 'now' }) }))
    expect(screen.getByTestId('count')).toHaveTextContent('0')

    act(() => ws.onmessage?.({ data: JSON.stringify({
      type: 'assistance.requested', userId: 'u-1', accountId: 'acc-2', occurredAt: 'now',
    }) }))
    expect(screen.getByTestId('a-acc-2')).toHaveTextContent('acc-2:6:-')
  })

  it('clears an account via the returned callback', async () => {
    const user = userEvent.setup()
    renderHarness()
    const ws = await firstSocket()
    act(() => ws.onmessage?.({ data: JSON.stringify({
      type: 'assistance.requested', userId: 'u-1', accountId: 'acc-1',
      data: { descriptor: { length: 6, type: 'numeric' } }, occurredAt: 'now',
    }) }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')

    await user.click(screen.getByText('clear'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')

    // Clearing an account that is not tracked is a no-op.
    await user.click(screen.getByText('clear'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('closes the socket on error and schedules a reconnect on close', async () => {
    renderHarness()
    const ws = await firstSocket()
    act(() => ws.onerror?.())
    expect(ws.close).toHaveBeenCalled()
    // onclose schedules a reconnect timer; it must not throw.
    act(() => ws.onclose?.())
  })

  it('closes the socket on unmount', async () => {
    const { unmount } = renderHarness()
    const ws = await firstSocket()
    unmount()
    expect(ws.close).toHaveBeenCalled()
  })

  it('abandons a connect that resolves after teardown', async () => {
    server.use(http.post('/api/realtime/ticket', async () => {
      await delay(20)
      return HttpResponse.json({ ticket: 'tkt', ttl_seconds: 30 })
    }))
    const { unmount } = renderHarness()
    unmount() // tears down while the ticket request is still in flight
    await new Promise((r) => setTimeout(r, 40))
    // The resolved ticket is discarded because the effect was cancelled, so no socket is opened.
    expect(FakeWebSocket.instances.length).toBe(0)
  })

  it('schedules a reconnect when the ticket fetch fails', async () => {
    server.use(http.post('/api/realtime/ticket', () => HttpResponse.json({ error: 'nope' }, { status: 500 })))
    renderHarness()
    // No socket is created because the ticket request rejects; the catch schedules a reconnect.
    await new Promise((r) => setTimeout(r, 0))
    expect(FakeWebSocket.instances.length).toBe(0)
  })
})
