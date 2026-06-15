import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Checkbox } from '@/shared/ui/checkbox'

describe('Checkbox', () => {
  it('renders with checkbox data-slot', () => {
    render(<Checkbox data-testid="cb" aria-label="toggle" />)
    expect(screen.getByTestId('cb')).toHaveAttribute('data-slot', 'checkbox')
  })

  it('merges custom className', () => {
    render(<Checkbox data-testid="cb" className="c-cb" aria-label="toggle" />)
    expect(screen.getByTestId('cb').className).toContain('c-cb')
  })

  it('toggles via user click', async () => {
    const user = userEvent.setup()
    render(<Checkbox data-testid="cb" aria-label="toggle" />)
    const el = screen.getByTestId('cb')
    expect(el).toHaveAttribute('aria-checked', 'false')
    await user.click(el)
    expect(el).toHaveAttribute('aria-checked', 'true')
  })

  it('shows a checkmark when checked', () => {
    render(<Checkbox checked aria-label="toggle" />)
    expect(document.querySelector('[data-slot="checkbox-indicator"] svg polyline')).toBeTruthy()
  })
})
