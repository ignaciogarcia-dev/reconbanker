import { describe, it, expect, vi, afterEach } from 'vitest'
import { withTimeout } from './withTimeout.js'
import { TimeoutError } from '../errors/index.js'

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with the value when the promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('propagates rejection when the promise rejects before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })

  it('rejects with a TimeoutError when the timer wins', async () => {
    vi.useFakeTimers()
    const pending = new Promise(() => {})
    const raced = withTimeout(pending, 5000, 'scrape')
    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    await expect(raced).rejects.toThrow('scrape timed out after 5000ms')
  })

  it('clears the timer once the promise settles so it does not keep the loop alive', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withTimeout(Promise.resolve('done'), 10_000)
    expect(clearSpy).toHaveBeenCalled()
  })
})
