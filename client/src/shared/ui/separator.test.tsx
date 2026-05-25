import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Separator } from '@/shared/ui/separator'

describe('Separator', () => {
  it('renders with the separator data-slot and horizontal orientation by default', () => {
    render(<Separator data-testid="sep" />)
    const el = screen.getByTestId('sep')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('data-slot', 'separator')
    expect(el).toHaveAttribute('data-orientation', 'horizontal')
  })

  it('supports vertical orientation', () => {
    render(<Separator data-testid="sep" orientation="vertical" />)
    expect(screen.getByTestId('sep')).toHaveAttribute(
      'data-orientation',
      'vertical'
    )
  })

  it('merges custom className with defaults', () => {
    render(<Separator data-testid="sep" className="custom-sep" />)
    const el = screen.getByTestId('sep')
    expect(el.className).toContain('custom-sep')
    expect(el.className).toContain('shrink-0')
  })
})
