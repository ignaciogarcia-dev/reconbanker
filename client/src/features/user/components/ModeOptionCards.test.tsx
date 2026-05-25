import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/shared/i18n'
import { ModeOptionCards } from './ModeOptionCards'

describe('ModeOptionCards', () => {
  it('renders both modes with their titles, descriptions, and the recommended badge', () => {
    render(<ModeOptionCards value={null} onChange={() => {}} />)
    expect(screen.getByText(/Conciliación/)).toBeInTheDocument()
    expect(screen.getByText(/Notificación directa/)).toBeInTheDocument()
    expect(screen.getByText(/Recomendado/i)).toBeInTheDocument()
  })

  it('marks the selected card with aria-pressed=true', () => {
    render(<ModeOptionCards value="passthrough" onChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    const selected = buttons.find(
      b => b.getAttribute('aria-pressed') === 'true'
    )
    expect(selected?.textContent).toMatch(/Notificación directa/)
  })

  it('fires onChange with the clicked mode', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModeOptionCards value={null} onChange={onChange} />)
    await user.click(
      screen.getByRole('button', { name: /Conciliación/i })
    )
    expect(onChange).toHaveBeenCalledWith('reconcile')
    await user.click(
      screen.getByRole('button', { name: /Notificación directa/i })
    )
    expect(onChange).toHaveBeenCalledWith('passthrough')
  })
})
