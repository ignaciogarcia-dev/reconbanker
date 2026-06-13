import { describe, expect, it } from 'vitest'
import { toNotifiableType } from './events.js'

describe('toNotifiableType', () => {
  it('maps externally-notifiable events to their public names', () => {
    expect(toNotifiableType('assistance.requested')).toBe('assistance_required')
    expect(toNotifiableType('login.failed')).toBe('login_failed')
    expect(toNotifiableType('scrape.failed')).toBe('scrape_failed')
  })

  it('returns null for dashboard-only events', () => {
    expect(toNotifiableType('assistance.fulfilled')).toBeNull()
    expect(toNotifiableType('assistance.cancelled')).toBeNull()
    expect(toNotifiableType('session.started')).toBeNull()
    expect(toNotifiableType('scrape.succeeded')).toBeNull()
  })
})
