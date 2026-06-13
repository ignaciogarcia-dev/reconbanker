import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryError } from './QueryError'
import i18n from '@/shared/i18n'

describe('QueryError', () => {
  it('renders the load failed message and a retry button', () => {
    render(<QueryError onRetry={() => {}} />)
    expect(screen.getByText(i18n.t('errors.loadFailed'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('errors.retry') })).toBeInTheDocument()
  })

  it('calls onRetry when the button is clicked', () => {
    const onRetry = vi.fn()
    render(<QueryError onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('errors.retry') }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
