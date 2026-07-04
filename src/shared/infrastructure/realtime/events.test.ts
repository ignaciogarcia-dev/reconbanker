import { describe, expect, it } from 'vitest'
import { toNotifiableType } from './events.js'

describe('toNotifiableType', () => {
  it('maps externally-notifiable events to their public names', () => {
    expect(toNotifiableType('assistance.requested')).toBe('assistance_required')
    expect(toNotifiableType('connection.failed')).toBe('connection_failed')
    expect(toNotifiableType('scrape.failed')).toBe('scrape_failed')
    // Recoveries ride their failure's subscription; needs_attention/recovered ride assistance.
    expect(toNotifiableType('connection.recovered')).toBe('connection_failed')
    expect(toNotifiableType('scrape.recovered')).toBe('scrape_failed')
    expect(toNotifiableType('session.needs_attention')).toBe('assistance_required')
    expect(toNotifiableType('session.recovered')).toBe('assistance_required')
  })

  it('returns null for dashboard-only events', () => {
    expect(toNotifiableType('assistance.fulfilled')).toBeNull()
    expect(toNotifiableType('assistance.cancelled')).toBeNull()
    expect(toNotifiableType('session.started')).toBeNull()
    expect(toNotifiableType('session.stopped')).toBeNull()
  })
})
