import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'
import '@/shared/i18n'
import i18n from '@/shared/i18n'

function Bomb(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('all good')).toBeInTheDocument()
  })

  it('shows the fallback instead of a blank screen when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText(i18n.t('errorBoundary.title'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('errorBoundary.goHome') })).toBeInTheDocument()
    spy.mockRestore()
  })
})
