import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import type { Mutation } from '@tanstack/react-query'
import App, { queryClient } from './App'
import i18n from '@/shared/i18n'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/login')
  })

  it('renders without crashing and shows the login page when unauthenticated', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    })
  })

  describe('mutation cache error fallback', () => {
    const onError = queryClient.getMutationCache().config.onError!
    const fakeMutation = (overrides: { onError?: () => void; meta?: Record<string, unknown> }) =>
      ({ options: { onError: overrides.onError }, meta: overrides.meta }) as unknown as Mutation<
        unknown,
        unknown,
        unknown
      >
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '')
    })

    afterEach(() => {
      errorSpy.mockRestore()
    })

    it('does not toast when the mutation declares its own onError', () => {
      onError(new Error('x'), undefined, undefined, fakeMutation({ onError: () => {} }))
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('does not toast when the mutation marks the error as handled via meta', () => {
      onError(new Error('x'), undefined, undefined, fakeMutation({ meta: { errorHandled: true } }))
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('toasts the server message for unhandled failures', () => {
      const err = { response: { data: { error: 'server says no' } } }
      onError(err, undefined, undefined, fakeMutation({ meta: {} }))
      expect(errorSpy).toHaveBeenCalledWith('server says no')
    })

    it('falls back to the generic message when the error has no usable payload', () => {
      onError(new Error('x'), undefined, undefined, fakeMutation({}))
      expect(errorSpy).toHaveBeenCalledWith(i18n.t('errors.generic'))
    })
  })
})
