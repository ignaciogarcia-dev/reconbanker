import { describe, it, expect } from 'vitest'
import { formatSlackMessage } from './slackMessage.js'
import { SystemEvent } from './events.js'

const base = (over: Partial<SystemEvent> = {}): SystemEvent => ({
  type: 'connection.failed',
  userId: 'u-1',
  accountId: 'acc-1',
  occurredAt: '2026-06-22T14:05:00.000Z',
  ...over,
})

const label = { bankName: 'Banco Pichincha', accountName: 'Mi cuenta sueldo' }

describe('formatSlackMessage', () => {
  it('renders a connection failure with the bank+alias name and an IT call-to-action', () => {
    const text = formatSlackMessage(base({ type: 'connection.failed', data: { category: 'login_failed' } }), label)
    expect(text).toContain(':x:')
    expect(text).toContain('*Falla de conexión* — Banco Pichincha · Mi cuenta sueldo')
    expect(text).toContain('*Motivo*: No se pudo autenticar')
    expect(text).toContain('*Qué hacer*: Requiere intervención de IT')
    expect(text).not.toContain('acc-1')
  })

  it('renders a scrape failure telling the operator no intervention is needed', () => {
    const text = formatSlackMessage(base({ type: 'scrape.failed', data: { category: 'detail_extraction_failed' } }), label)
    expect(text).toContain(':warning:')
    expect(text).toContain('*Falla del scrape* — Banco Pichincha · Mi cuenta sueldo')
    expect(text).toContain('*Motivo*: Error extrayendo el detalle')
    expect(text).toContain('*Qué hacer*: No requiere intervención')
  })

  it('renders a recovery message', () => {
    const text = formatSlackMessage(base({ type: 'scrape.recovered', data: {} }), label)
    expect(text).toContain(':white_check_mark:')
    expect(text).toContain('*Cuenta restablecida* — Banco Pichincha · Mi cuenta sueldo')
    expect(text).toContain('El scrape volvió a funcionar con normalidad.')
    expect(text).not.toContain('*Motivo*')
    expect(text).not.toContain('*Qué hacer*')
  })

  it('renders a session reactivation message', () => {
    const text = formatSlackMessage(base({ type: 'session.recovered', data: {} }), label)
    expect(text).toContain(':white_check_mark:')
    expect(text).toContain('*Sesión reactivada* — Banco Pichincha · Mi cuenta sueldo')
    expect(text).toContain('La sesión se reconectó correctamente.')
    expect(text).not.toContain('*Motivo*')
    expect(text).not.toContain('*Qué hacer*')
  })

  it('does not show an attempts/streak count', () => {
    const text = formatSlackMessage(base({ type: 'scrape.failed', data: { category: 'timeout', streak: 3 } }), label)
    expect(text).not.toContain('Intentos')
    expect(text).not.toContain('consecutiv')
  })

  it('falls back to "cuenta <id>" when no label is provided', () => {
    const text = formatSlackMessage(base({ type: 'connection.failed', data: { category: 'navigation_failed' } }))
    expect(text).toContain('cuenta acc-1')
  })

  it('uses only the bank name when there is no alias', () => {
    const text = formatSlackMessage(base({ type: 'scrape.failed', data: { category: 'unknown' } }), { bankName: 'Banco Pichincha' })
    expect(text).toContain('— Banco Pichincha')
    expect(text).not.toContain('·')
  })

  it('renders assistance with the name but no category/action line', () => {
    const text = formatSlackMessage(base({ type: 'assistance.requested', data: {} }), label)
    expect(text).toContain('*Se requiere asistencia* — Banco Pichincha · Mi cuenta sueldo')
    expect(text).not.toContain('*Motivo*')
    expect(text).not.toContain('*Qué hacer*')
  })

  it('falls back to the raw category when unmapped', () => {
    const text = formatSlackMessage(base({ type: 'scrape.failed', data: { category: 'brand_new_category' } }), label)
    expect(text).toContain('*Motivo*: brand_new_category')
  })

  it('falls back to the raw event type when no label is mapped', () => {
    const text = formatSlackMessage(base({ type: 'assistance.fulfilled', data: {} }), label)
    expect(text).toContain(':information_source:')
    expect(text).toContain('*assistance.fulfilled*')
  })

  it('omits the category line when category is not a string', () => {
    const text = formatSlackMessage(base({ type: 'scrape.failed', data: { category: 42 } }), label)
    expect(text).not.toContain('*Motivo*')
  })

  it('renders a session needs-attention reason', () => {
    const text = formatSlackMessage(base({ type: 'session.needs_attention', data: { reason: 'logged_out' } }), label)
    expect(text).toContain(':rotating_light:')
    expect(text).toContain('*Sesión requiere reactivación*')
    expect(text).toContain('*Motivo*: Se perdió la sesión')
  })

  it('labels watchdog_timeout for a needs_attention message', () => {
    const msg = formatSlackMessage({
      type: 'session.needs_attention', userId: 'u', accountId: 'acc-1',
      data: { reason: 'watchdog_timeout' }, occurredAt: '2026-07-02T12:00:00.000Z',
    })
    expect(msg).toContain('Dejó de responder')
  })
})
