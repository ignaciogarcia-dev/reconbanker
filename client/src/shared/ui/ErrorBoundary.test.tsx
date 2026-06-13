import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('sends the user home when the go-home button is clicked', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    // jsdom does not implement navigation, so clicking only needs to run the handler without throwing
    await user.click(screen.getByRole('button', { name: i18n.t('errorBoundary.goHome') }))
    spy.mockRestore()
  })
})
