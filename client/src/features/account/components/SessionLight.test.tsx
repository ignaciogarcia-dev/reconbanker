import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../tests/utils/render'
import { SessionLight } from './SessionLight'

describe('SessionLight', () => {
  it('shows the running label when scraping', () => {
    renderWithProviders(<SessionLight status="running" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Scrapeando')
  })

  it('shows the connecting label while starting', () => {
    renderWithProviders(<SessionLight status="starting" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Conectando…')
  })

  it('shows the needs-reactivation label on needs_attention', () => {
    renderWithProviders(<SessionLight status="needs_attention" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Requiere reactivación')
  })

  it('shows the off label when stopped or null', () => {
    const { rerender } = renderWithProviders(<SessionLight status="stopped" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Apagada')
    rerender(<SessionLight status={null} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Apagada')
  })
})
