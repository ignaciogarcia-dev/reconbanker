import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton } from '@/shared/ui/skeleton'

describe('Skeleton', () => {
  it('renders a div with the skeleton data-slot', () => {
    render(<Skeleton data-testid="sk" />)
    const el = screen.getByTestId('sk')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('data-slot', 'skeleton')
  })

  it('merges custom className with defaults', () => {
    render(<Skeleton data-testid="sk" className="custom-cls" />)
    const el = screen.getByTestId('sk')
    expect(el.className).toContain('custom-cls')
    expect(el.className).toContain('animate-pulse')
  })

  it('forwards extra props', () => {
    render(<Skeleton data-testid="sk" aria-label="loading" />)
    expect(screen.getByTestId('sk')).toHaveAttribute('aria-label', 'loading')
  })
})
