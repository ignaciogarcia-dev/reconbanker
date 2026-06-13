import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'

// Capture the formatter props recharts is asked to render so we can drive the
// `tickFormatter` / `labelFormatter` branches under JSDOM without needing a
// real layout pass.
const capturedFormatters: {
  tick?: (v: string) => string
  label?: (v: unknown) => string
  value?: (v: unknown) => [unknown, string]
}[] = []

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 400, height: 240 }}>{children}</div>
    ),
    XAxis: (props: { tickFormatter?: (v: string) => string }) => {
      if (props.tickFormatter) {
        capturedFormatters[capturedFormatters.length - 1] ??= {}
        capturedFormatters[capturedFormatters.length - 1].tick = props.tickFormatter
      }
      return null
    },
    Tooltip: (props: {
      labelFormatter?: (v: unknown) => string
      formatter?: (v: unknown) => [unknown, string]
    }) => {
      const slot = capturedFormatters[capturedFormatters.length - 1] ?? (capturedFormatters[capturedFormatters.length - 1] = {})
      if (props.labelFormatter) slot.label = props.labelFormatter
      if (props.formatter) slot.value = props.formatter
      return null
    },
    LineChart: ({ children }: { children: ReactNode }) => {
      // Push a fresh slot for each chart instance.
      capturedFormatters.push({})
      return <div data-testid="line-chart">{children}</div>
    },
  }
})
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { conciliationHandlers } from '../../../../tests/msw/handlers/conciliation'
import { bankingHandlers } from '../../../../tests/msw/handlers/banking'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Dashboard } from './Dashboard'

const baseConciliation = {
  id: 'c-1',
  accountId: 'a-1',
  externalId: 'ord-1',
  expectedAmount: 100,
  currency: 'ARS',
  senderName: 'Alice',
  status: 'pending' as const,
  retryCount: 0,
  lastCheckedAt: null,
  createdAt: '2026-05-17T10:00:00Z',
  bank: 'mi-dinero',
  accountName: 'Cuenta 1',
}

const baseMovement = {
  id: 'm-1',
  externalId: 'ext-1',
  amount: 100,
  currency: 'ARS',
  senderName: 'Alice',
  receivedAt: '2026-05-17T10:00:00Z',
  notifiedAt: null,
  excludedAt: null,
}

function setReconcile() {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json({
        id: 'u-1',
        email: 'test@x',
        name: 'T',
        operation_mode: 'reconcile',
      })
    )
  )
}

function setPassthrough() {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json({
        id: 'u-1',
        email: 'test@x',
        name: 'T',
        operation_mode: 'passthrough',
      })
    )
  )
}

describe('Dashboard (reconcile mode)', () => {
  beforeEach(() => {
    setReconcile()
    server.use(...accountHandlers, ...conciliationHandlers, ...bankingHandlers)
  })

  it('renders the title and reconcile stat cards', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
    expect(screen.getByText('Cuentas activas')).toBeInTheDocument()
    expect(screen.getByText('Conciliaciones')).toBeInTheDocument()
    expect(screen.getByText('Conciliadas hoy')).toBeInTheDocument()
    expect(screen.getByText('Sin conciliar')).toBeInTheDocument()
  })

  it('counts unreconciled (pending + processing) and reconciled-today rows', async () => {
    // Build a "today at noon local" timestamp so toLocaleDateString('sv') of
    // both the row and the page-computed "today" land on the same calendar day.
    const now = new Date()
    const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString()
    server.use(
      http.get('/api/conciliation', () =>
        HttpResponse.json([
          { ...baseConciliation, id: 'c-pending', status: 'pending' },
          { ...baseConciliation, id: 'c-processing', status: 'processing' },
          { ...baseConciliation, id: 'c-matched-today', status: 'matched', createdAt: todayNoon },
          { ...baseConciliation, id: 'c-matched-old', status: 'matched', createdAt: '2024-01-01T00:00:00Z' },
        ])
      )
    )
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Cuentas activas')).toBeInTheDocument()
    })
    // Wait for the unreconciled stat to reflect the new data (=2).
    await waitFor(() => {
      const card = screen.getByText('Sin conciliar').closest('[data-slot="card"]')!
      expect(card.textContent).toContain('2')
    })
    // Reconciled-today count = 1 (only c-matched-today).
    const reconciledTodayCard = screen.getByText('Conciliadas hoy').closest('[data-slot="card"]')!
    expect(reconciledTodayCard.textContent).toContain('1')
  })

  it('renders the empty-chart placeholder when no matched rows exist', async () => {
    server.use(http.get('/api/conciliation', () => HttpResponse.json([])))
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Aún no hay datos')).toBeInTheDocument()
    })
  })
})

describe('Dashboard (passthrough mode)', () => {
  beforeEach(() => {
    setPassthrough()
    server.use(...accountHandlers, ...conciliationHandlers, ...bankingHandlers)
  })

  it('renders passthrough stat cards', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Total movimientos')).toBeInTheDocument()
    })
    expect(screen.getByText('Notificados')).toBeInTheDocument()
    expect(screen.getByText('Pendientes de notificar')).toBeInTheDocument()
    expect(screen.getByText('Movimientos a lo largo del tiempo')).toBeInTheDocument()
  })

  it('counts notified and pending movements correctly', async () => {
    server.use(
      http.get('/api/accounts/:accountId/movements', () =>
        HttpResponse.json([
          { ...baseMovement, id: 'm-1', notifiedAt: '2026-05-17T11:00:00Z' },
          { ...baseMovement, id: 'm-2', notifiedAt: null, excludedAt: null },
          { ...baseMovement, id: 'm-3', notifiedAt: null, excludedAt: '2026-05-17T11:00:00Z' },
        ])
      )
    )
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Total movimientos')).toBeInTheDocument()
    })

    // Notified = 1, pending = 1 (m-2; m-3 excluded).
    await waitFor(() => {
      const totalCard = screen.getByText('Total movimientos').closest('[data-slot="card"]')!
      expect(totalCard.textContent).toContain('3')
    })
  })

  it('groups movement chart by month when range is wider than 90 days', async () => {
    server.use(
      http.get('/api/accounts/:accountId/movements', () =>
        HttpResponse.json([
          { ...baseMovement, id: 'm-old', receivedAt: '2024-01-01T10:00:00Z' },
          { ...baseMovement, id: 'm-new', receivedAt: '2026-05-17T10:00:00Z' },
        ])
      )
    )
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Movimientos a lo largo del tiempo')).toBeInTheDocument()
    })
    // With data present the chart-empty placeholder must NOT render.
    await waitFor(() => {
      const total = screen.getByText('Total movimientos').closest('[data-slot="card"]')!
      expect(total.textContent).toContain('2')
    })
    expect(screen.queryByText('Aún no hay datos')).not.toBeInTheDocument()
  })

  it('renders the chart-empty placeholder when there are no movements', async () => {
    server.use(http.get('/api/accounts/:accountId/movements', () => HttpResponse.json([])))
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Aún no hay datos')).toBeInTheDocument()
    })
  })

  it('exercises the chart tick + tooltip formatters for both day and month grouping', async () => {
    capturedFormatters.length = 0
    // Same-month receivedAt → not grouped by month.
    server.use(
      http.get('/api/accounts/:accountId/movements', () =>
        HttpResponse.json([
          { ...baseMovement, id: 'm-1', receivedAt: '2026-05-17T10:00:00Z' },
          { ...baseMovement, id: 'm-2', receivedAt: '2026-05-18T10:00:00Z' },
        ])
      )
    )
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })
    const dayFmt = capturedFormatters.at(-1)!
    expect(dayFmt.tick).toBeDefined()
    expect(dayFmt.label).toBeDefined()
    // Day-grouped tick: 2026-05-17 → 17/05
    expect(dayFmt.tick!('2026-05-17')).toBe('17/05')
    // Day-grouped label: passed through.
    expect(dayFmt.label!('2026-05-17')).toBe('2026-05-17')
    expect(dayFmt.label!(null)).toBe('')
    // Value formatter: returns [value, seriesLabel] with a 0 fallback.
    expect(dayFmt.value).toBeDefined()
    expect(dayFmt.value!(5)).toEqual([5, expect.any(String)])
    expect(dayFmt.value!(null)).toEqual([0, expect.any(String)])
  })

  it('exercises the chart tick + tooltip formatters when grouped by month', async () => {
    capturedFormatters.length = 0
    // Range > 90 days → grouped by month.
    server.use(
      http.get('/api/accounts/:accountId/movements', () =>
        HttpResponse.json([
          { ...baseMovement, id: 'm-1', receivedAt: '2024-01-01T10:00:00Z' },
          { ...baseMovement, id: 'm-2', receivedAt: '2026-05-17T10:00:00Z' },
        ])
      )
    )
    renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })
    const monthFmt = capturedFormatters.at(-1)!
    expect(monthFmt.tick).toBeDefined()
    expect(monthFmt.label).toBeDefined()
    // Month-grouped tick: 2026-05 → 05/26
    expect(monthFmt.tick!('2026-05')).toBe('05/26')
    // Month-grouped label: 2026-05 → 05/2026
    expect(monthFmt.label!('2026-05')).toBe('05/2026')
  })

  it('shows the query error state and retries all failing queries', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts', () => HttpResponse.json({}, { status: 500 })),
      http.get('/api/conciliation', () => HttpResponse.json({}, { status: 500 }))
    )
    renderWithProviders(<Dashboard />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    // Fix the endpoints and retry.
    server.use(...accountHandlers, ...conciliationHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => {
      expect(screen.queryByText(/No se pudieron cargar los datos/i)).not.toBeInTheDocument()
    })
  })

  it('retries only the accounts query when it is the only failing one', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/accounts', () => HttpResponse.json({}, { status: 500 })))
    renderWithProviders(<Dashboard />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    server.use(...accountHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => {
      expect(screen.queryByText(/No se pudieron cargar los datos/i)).not.toBeInTheDocument()
    })
  })

  it('retries only the conciliations query when it is the only failing one', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/conciliation', () => HttpResponse.json({}, { status: 500 })))
    renderWithProviders(<Dashboard />)
    expect(await screen.findByText(/No se pudieron cargar los datos/i)).toBeInTheDocument()
    server.use(...conciliationHandlers)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => {
      expect(screen.queryByText(/No se pudieron cargar los datos/i)).not.toBeInTheDocument()
    })
  })
})
