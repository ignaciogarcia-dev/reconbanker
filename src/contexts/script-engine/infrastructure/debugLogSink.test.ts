import { describe, it, expect, vi } from 'vitest'
import { makeDebugLogSink } from './debugLogSink.js'

const fakeLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
})

const emit = (event: string, data: Record<string, unknown> = {}) =>
  JSON.stringify({ at: '2026-06-09T00:00:00.000Z', event, ...data })

describe('makeDebugLogSink', () => {
  describe('level classification', () => {
    it('maps known lifecycle events to their level', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      sink(emit('logged_out'))
      sink(emit('authenticated'))
      sink(emit('poll_summary'))
      expect(log.warn).toHaveBeenCalledWith('logged_out', expect.any(Object))
      expect(log.info).toHaveBeenCalledWith('authenticated', expect.any(Object))
      expect(log.info).toHaveBeenCalledWith('poll_summary', expect.any(Object))
    })

    it('classifies auth_timeout as warn (pattern), consistent with SessionManager', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(emit('auth_timeout'))
      expect(log.warn).toHaveBeenCalledWith('auth_timeout', expect.any(Object))
      expect(log.error).not.toHaveBeenCalled()
    })

    it('maps navigation_failed to error (override beats the *_failed pattern)', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(emit('navigation_failed'))
      expect(log.error).toHaveBeenCalledWith('navigation_failed', expect.any(Object))
      expect(log.warn).not.toHaveBeenCalled()
    })

    it('maps failure-shaped events to warn via pattern', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      for (const e of [
        'foo_failed', 'detail_uuid_timeout', 'detail_fetch_error', 'detail_row_missing',
        'transactions_not_captured', 'see_movements_link_not_visible', 'pagination_cap_reached',
        'movements_empty_or_invalid', 'detail_mismatch', 'dom_rows_missing',
      ]) sink(emit(e))
      expect(log.warn).toHaveBeenCalledTimes(10)
      expect(log.debug).not.toHaveBeenCalled()
    })

    it('defaults unknown / step events to debug', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      sink(emit('pagination_done'))
      sink(emit('login_submit_start'))
      sink(emit('something_brand_new'))
      expect(log.debug).toHaveBeenCalledTimes(3)
    })

    it('honors a valid explicit level field, ignores an invalid one', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      sink(emit('pagination_done', { level: 'warn' }))   // valid -> warn
      sink(emit('pagination_done', { level: 'trace' }))  // invalid -> classify -> debug
      expect(log.warn).toHaveBeenCalledTimes(1)
      expect(log.debug).toHaveBeenCalledTimes(1)
    })

    it('covers the remaining override events (poll_failed/stop_requested/max_runtime)', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      sink(emit('poll_failed'))
      sink(emit('stop_requested'))
      sink(emit('max_runtime'))
      expect(log.warn).toHaveBeenCalledWith('poll_failed', expect.any(Object))
      expect(log.info).toHaveBeenCalledWith('stop_requested', expect.any(Object))
      expect(log.info).toHaveBeenCalledWith('max_runtime', expect.any(Object))
    })

    it('classifies an empty-string event as debug, but still honors an explicit level', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      sink(emit(''))                       // empty event -> debug, name monitor_event
      sink(emit('', { level: 'info' }))    // explicit level wins
      expect(log.debug).toHaveBeenCalledWith('monitor_event', expect.any(Object))
      expect(log.info).toHaveBeenCalledWith('monitor_event', expect.any(Object))
    })
  })

  describe('meta handling', () => {
    it('merges baseMeta and forwards payload fields, keeping at', () => {
      const log = fakeLogger()
      makeDebugLogSink(log, { accountId: 'acc-1', bank: 'pichincha' })(
        emit('poll_summary', { incoming: 3, merged: 20 })
      )
      expect(log.info).toHaveBeenCalledWith('poll_summary', {
        accountId: 'acc-1',
        bank: 'pichincha',
        at: '2026-06-09T00:00:00.000Z',
        incoming: 3,
        merged: 20,
      })
    })

    it('strips reserved/colliding keys from the payload', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(
        emit('poll_summary', { message: 'x', level: 'error', timestamp: 'y', context: 'z', keep: 1 })
      )
      // explicit level 'error' is consumed as a level hint -> routes to error
      expect(log.error).toHaveBeenCalled()
      const meta = log.error.mock.calls[0][1] as Record<string, unknown>
      expect(meta).not.toHaveProperty('message')
      expect(meta).not.toHaveProperty('timestamp')
      expect(meta).not.toHaveProperty('context')
      expect(meta).not.toHaveProperty('level')
      expect(meta.keep).toBe(1)
    })

    it('redacts credential-like keys', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(
        emit('poll_summary', { password: 'hunter2', token: 'abc', Authorization: 'Bearer x', safe: 'ok' })
      )
      const meta = log.info.mock.calls[0][1] as Record<string, unknown>
      expect(meta.password).toBe('[REDACTED]')
      expect(meta.token).toBe('[REDACTED]')
      expect(meta.Authorization).toBe('[REDACTED]')
      expect(meta.safe).toBe('ok')
    })

    it('redacts credential keys regardless of casing', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(
        emit('poll_summary', {
          PASSWORD: 'a', Token: 'b', SECRET: 'c', Pin: 'd', Credential: 'e', AUTHORIZATION: 'f',
        })
      )
      const meta = log.info.mock.calls[0][1] as Record<string, unknown>
      for (const k of ['PASSWORD', 'Token', 'SECRET', 'Pin', 'Credential', 'AUTHORIZATION']) {
        expect(meta[k]).toBe('[REDACTED]')
      }
    })

    it('redacts compound credential key names (substring match)', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(
        emit('poll_summary', {
          accessToken: 'a', apiKey: 'b', api_key: 'c', refreshToken: 'd',
          passwordHash: 'e', sessionCookie: 'f',
        })
      )
      const meta = log.info.mock.calls[0][1] as Record<string, unknown>
      for (const k of ['accessToken', 'apiKey', 'api_key', 'refreshToken', 'passwordHash', 'sessionCookie']) {
        expect(meta[k]).toBe('[REDACTED]')
      }
    })

    it('does not over-redact benign keys that merely contain short stems', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(
        emit('poll_summary', { shipping: 'addr', authenticated: true, monkey: 'm', incoming: 3 })
      )
      const meta = log.info.mock.calls[0][1] as Record<string, unknown>
      expect(meta.shipping).toBe('addr')        // contains "pin" — exact-match only
      expect(meta.authenticated).toBe(true)     // contains "auth" — exact-match only
      expect(meta.monkey).toBe('m')             // contains "key" — exact-match only
      expect(meta.incoming).toBe(3)
    })

    it('lets system baseMeta win over a script-spoofed accountId/bank', () => {
      const log = fakeLogger()
      makeDebugLogSink(log, { accountId: 'real', bank: 'pichincha' })(
        emit('poll_summary', { accountId: 'spoof', bank: 'evil', incoming: 1 })
      )
      const meta = log.info.mock.calls[0][1] as Record<string, unknown>
      expect(meta.accountId).toBe('real')
      expect(meta.bank).toBe('pichincha')
      expect(meta.incoming).toBe(1)
    })

    it('omits at when the payload has none', () => {
      const log = fakeLogger()
      makeDebugLogSink(log)(JSON.stringify({ event: 'poll_summary', incoming: 2 }))
      const meta = log.info.mock.calls[0][1] as Record<string, unknown>
      expect(meta).not.toHaveProperty('at')
      expect(meta.incoming).toBe(2)
    })
  })

  describe('guards', () => {
    it('falls back to debug for non-JSON lines', () => {
      const log = fakeLogger()
      makeDebugLogSink(log, { accountId: 'a' })('not json at all')
      expect(log.debug).toHaveBeenCalledWith('not json at all', { accountId: 'a' })
    })

    it('does not throw on non-object JSON (number/null/string)', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      expect(() => { sink('123'); sink('null'); sink('"hello"') }).not.toThrow()
      expect(log.debug).toHaveBeenCalledTimes(3)
    })

    it('treats a JSON array as a non-record and falls back to debug', () => {
      const log = fakeLogger()
      makeDebugLogSink(log, { accountId: 'a' })('[1,2,3]')
      expect(log.debug).toHaveBeenCalledWith('[1,2,3]', { accountId: 'a' })
      expect(log.info).not.toHaveBeenCalled()
      expect(log.warn).not.toHaveBeenCalled()
    })

    it('ignores non-string input without calling the logger', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      for (const bad of [null, undefined, 123, {}, []] as unknown[]) {
        sink(bad as string)
      }
      expect(log.debug).not.toHaveBeenCalled()
      expect(log.info).not.toHaveBeenCalled()
      expect(log.warn).not.toHaveBeenCalled()
      expect(log.error).not.toHaveBeenCalled()
    })

    it('processes a line exactly at the 1MB cap, rejects one byte over', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)

      // Pad an otherwise-valid event so the serialized line is exactly 1_000_000 bytes.
      const base = JSON.stringify({ event: 'poll_summary', pad: '' })
      const atCap = JSON.stringify({ event: 'poll_summary', pad: 'x'.repeat(1_000_000 - base.length) })
      expect(atCap.length).toBe(1_000_000)
      sink(atCap)
      expect(log.info).toHaveBeenCalledWith('poll_summary', expect.any(Object))
      expect(log.warn).not.toHaveBeenCalled()

      sink('x'.repeat(1_000_001))
      expect(log.warn).toHaveBeenCalledWith('oversized_log_entry', expect.objectContaining({ size: 1_000_001 }))
    })

    it('drops oversized lines at warn without parsing', () => {
      const log = fakeLogger()
      const huge = JSON.stringify({ event: 'x', blob: 'a'.repeat(1_000_001) })
      makeDebugLogSink(log, { accountId: 'a' })(huge)
      expect(log.warn).toHaveBeenCalledWith('oversized_log_entry', expect.objectContaining({ accountId: 'a' }))
      expect(log.info).not.toHaveBeenCalled()
    })

    it('coerces a missing/non-string event to monitor_event', () => {
      const log = fakeLogger()
      const sink = makeDebugLogSink(log)
      sink(JSON.stringify({ at: 't' }))                 // no event -> debug + monitor_event
      sink(JSON.stringify({ event: 42, level: 'info' })) // non-string event
      expect(log.debug).toHaveBeenCalledWith('monitor_event', expect.any(Object))
      expect(log.info).toHaveBeenCalledWith('monitor_event', expect.any(Object))
    })

    it('never calls a non-existent logger method', () => {
      const log = fakeLogger()
      // @ts-expect-error - intentionally not present
      log.trace = undefined
      expect(() => makeDebugLogSink(log)(emit('whatever', { level: 'trace' }))).not.toThrow()
    })
  })
})
