import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Switch } from '@/shared/ui/switch'

describe('Switch', () => {
  it('renders with switch data-slot', () => {
    render(<Switch data-testid="sw" aria-label="toggle" />)
    const el = screen.getByTestId('sw')
    expect(el).toHaveAttribute('data-slot', 'switch')
  })

  it('merges custom className', () => {
    render(<Switch data-testid="sw" className="c-sw" aria-label="toggle" />)
    expect(screen.getByTestId('sw').className).toContain('c-sw')
  })

  it('toggles via user click', async () => {
    const user = userEvent.setup()
    render(<Switch data-testid="sw" aria-label="toggle" />)
    const el = screen.getByTestId('sw')
    expect(el).toHaveAttribute('aria-checked', 'false')
    await user.click(el)
    expect(el).toHaveAttribute('aria-checked', 'true')
  })
})
