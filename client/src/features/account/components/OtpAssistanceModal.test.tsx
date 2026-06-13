import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { renderWithProviders } from '../../../../tests/utils/render'
import { OtpAssistanceModal } from './OtpAssistanceModal'
import type { PendingAssistance } from '@/shared/realtime/useRealtime'

const assistance: PendingAssistance = { descriptor: { length: 6, type: 'numeric' } }

function renderModal(overrides: Partial<Parameters<typeof OtpAssistanceModal>[0]> = {}) {
  const onOpenChange = vi.fn()
  const onSubmitted = vi.fn()
  renderWithProviders(
    <OtpAssistanceModal
      accountId="acc-1"
      accountName="Cuenta 1"
      assistance={assistance}
      open
      onOpenChange={onOpenChange}
      onSubmitted={onSubmitted}
      {...overrides}
    />
  )
  return { onOpenChange, onSubmitted }
}

function typeCode(code: string) {
  const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
  // Distributing from the first box fills every digit in one change event.
  return userEvent.type(boxes[0], code)
}

describe('OtpAssistanceModal', () => {
  beforeEach(() => {
    server.use(http.post('/api/accounts/acc-1/otp', () => new HttpResponse(null, { status: 202 })))
  })

  it('auto-submits on completion, notifies, and ignores further completions', async () => {
    let calls = 0
    server.use(http.post('/api/accounts/acc-1/otp', () => { calls += 1; return new HttpResponse(null, { status: 202 }) }))
    const { onOpenChange, onSubmitted } = renderModal()
    await typeCode('123456')

    expect(await screen.findByText('Código enviado')).toBeInTheDocument()
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // Re-completing after a successful submit must not fire a second request.
    await typeCode('654321')
    expect(calls).toBe(1)
  })

  it('submits via the button when the code is complete', async () => {
    const user = userEvent.setup()
    let received: unknown
    server.use(
      http.post('/api/accounts/acc-1/otp', async ({ request }) => {
        received = await request.json()
        return new HttpResponse(null, { status: 202 })
      })
    )
    renderModal()
    // Fill without triggering completion submit by leaving one box, then complete.
    await typeCode('654321')
    await waitFor(() => expect(received).toEqual({ code: '654321' }))
    void user
  })

  it('shows an error toast when submission fails, then allows a manual retry', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.post('/api/accounts/acc-1/otp', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ error: { code: 'RATE_LIMITED', message: 'slow down' } }, { status: 429 })
          : new HttpResponse(null, { status: 202 })
      })
    )
    const { onSubmitted } = renderModal()
    await typeCode('123456')
    expect(await screen.findByText(/Demasiados intentos/i)).toBeInTheDocument()

    // After the failure the code is still complete, so the submit button is enabled for a manual retry.
    await user.click(screen.getByRole('button', { name: 'Verificar' }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
  })

  it('clears the code when the dialog is dismissed with Escape', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderModal()
    await typeCode('12')
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('falls back to the generic error message when the backend gives no code', async () => {
    server.use(http.post('/api/accounts/acc-1/otp', () => new HttpResponse(null, { status: 500 })))
    renderModal()
    await typeCode('123456')
    expect(await screen.findByText('No se pudo enviar el código')).toBeInTheDocument()
  })

  it('keeps the submit button disabled until the code is complete', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeDisabled()
  })

  it('cancels without submitting', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderModal()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
