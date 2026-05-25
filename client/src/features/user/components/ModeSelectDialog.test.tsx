import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/shared/i18n'
import { ModeSelectDialog } from './ModeSelectDialog'

describe('ModeSelectDialog', () => {
  it('renders nothing when closed', () => {
    render(<ModeSelectDialog open={false} onConfirm={() => {}} />)
    expect(
      screen.queryByText(/¿Cómo querés que opere ReconBanker?/i)
    ).not.toBeInTheDocument()
  })

  it('renders the title and disables Confirm until a mode is selected', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ModeSelectDialog open onConfirm={onConfirm} />)
    expect(
      screen.getByText(/¿Cómo querés que opere ReconBanker?/i)
    ).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: /Continuar/i })
    expect(confirmBtn).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Conciliación/i }))
    expect(confirmBtn).toBeEnabled()
    await user.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledWith('reconcile')
  })

  it('respects the isPending prop by disabling Confirm', async () => {
    const user = userEvent.setup()
    render(
      <ModeSelectDialog open onConfirm={() => {}} isPending />
    )
    await user.click(screen.getByRole('button', { name: /Conciliación/i }))
    expect(screen.getByRole('button', { name: /Continuar/i })).toBeDisabled()
  })
})
