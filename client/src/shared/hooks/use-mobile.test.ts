import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './use-mobile'

type Listener = (e?: unknown) => void

function makeMatchMedia(initialMatches: boolean) {
  const listeners: Listener[] = []
  const mql = {
    matches: initialMatches,
    addEventListener: vi.fn((_: string, fn: Listener) => listeners.push(fn)),
    removeEventListener: vi.fn((_: string, fn: Listener) => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    }),
  }
  return { mql, listeners }
}

describe('useIsMobile', () => {
  const originalInnerWidth = window.innerWidth
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    })
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia
    }
  })

  it('returns true when viewport width is below the breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    const { mql } = makeMatchMedia(true)
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia

    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when viewport width is above the breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    const { mql } = makeMatchMedia(false)
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia

    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates when the media query change handler fires', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 })
    const { mql, listeners } = makeMatchMedia(false)
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia

    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
      listeners.forEach(l => l())
    })

    expect(result.current).toBe(true)
  })

  it('removes the change listener on unmount', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 })
    const { mql } = makeMatchMedia(false)
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia

    const { unmount } = renderHook(() => useIsMobile())
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalled()
  })
})
