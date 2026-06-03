import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse, delay } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import { TwoFactorSection } from './TwoFactorSection'

vi.mock('sonner', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>)
  return { ...actual, toast: { success: vi.fn(), error: vi.fn() } }
})

const codeInput = () => screen.getByLabelText(/Código de 6 dígitos/i)
const passwordInput = () => screen.getByLabelText(/Contraseña/i)
const passwordInputOrNull = () => screen.queryByLabelText(/Contraseña/i)

describe('TwoFactorSection', () => {
  beforeEach(() => {
    server.use(...userHandlers)
    vi.clearAllMocks()
  })

  describe('when 2FA is disabled', () => {
    it('walks enroll → verify → backup codes → done', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={false} />)

      expect(screen.getByText(/está desactivada/i)).toBeInTheDocument()

      // enroll → QR + code input
      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      await screen.findByText(/Escaneá este código QR/i)
      expect(document.querySelector('svg')).toBeInTheDocument() // QR rendered

      // confirm → backup codes
      await user.type(codeInput(), '123456')
      await user.click(screen.getByRole('button', { name: /Verificar y activar/i }))
      expect(await screen.findByText(/Guardá tus códigos de respaldo/i)).toBeInTheDocument()
      expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument()
      expect(screen.getByText('CCCCC-DDDDD')).toBeInTheDocument()

      // done resets back to idle
      await user.click(screen.getByRole('button', { name: /^Listo$/i }))
      await waitFor(() => expect(screen.getByRole('button', { name: /Activar 2FA/i })).toBeInTheDocument())
    })

    it('copies backup codes to the clipboard', async () => {
      const user = userEvent.setup()
      const writeText = vi.fn()
      // Override AFTER setup() — user-event installs its own clipboard stub.
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      renderWithProviders(<TwoFactorSection enabled={false} />)

      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      await screen.findByText(/Escaneá este código QR/i)
      await user.type(codeInput(), '123456')
      await user.click(screen.getByRole('button', { name: /Verificar y activar/i }))
      await screen.findByText(/Guardá tus códigos de respaldo/i)

      await user.click(screen.getByRole('button', { name: /Copiar/i }))
      expect(writeText).toHaveBeenCalledWith('AAAAA-BBBBB\nCCCCC-DDDDD')
    })

    it('does not throw when the clipboard API is unavailable', async () => {
      const user = userEvent.setup()
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      renderWithProviders(<TwoFactorSection enabled={false} />)

      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      await screen.findByText(/Escaneá este código QR/i)
      await user.type(codeInput(), '123456')
      await user.click(screen.getByRole('button', { name: /Verificar y activar/i }))
      await screen.findByText(/Guardá tus códigos de respaldo/i)

      await user.click(screen.getByRole('button', { name: /Copiar/i }))
      expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument()
    })

    it('cancels enrollment back to idle', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={false} />)
      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      await screen.findByText(/Escaneá este código QR/i)
      await user.click(screen.getByRole('button', { name: /Cancelar/i }))
      await waitFor(() => expect(screen.getByRole('button', { name: /Activar 2FA/i })).toBeInTheDocument())
    })

    it('shows an error toast when enrollment fails', async () => {
      server.use(http.post('/api/me/2fa/enroll', () => new HttpResponse(null, { status: 409 })))
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={false} />)
      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })

    it('shows an error toast when the confirmation code is invalid', async () => {
      server.use(http.post('/api/me/2fa/confirm', () => new HttpResponse(null, { status: 401 })))
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={false} />)
      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      await screen.findByText(/Escaneá este código QR/i)
      await user.type(codeInput(), '000000')
      await user.click(screen.getByRole('button', { name: /Verificar y activar/i }))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })

    it('shows the pending label while enrolling', async () => {
      server.use(
        http.post('/api/me/2fa/enroll', async () => {
          await delay(50)
          return HttpResponse.json({ otpauth_uri: 'otpauth://totp/ReconBanker:test@x?secret=ABC' })
        })
      )
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={false} />)
      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      expect(await screen.findByText(/Guardando/i)).toBeInTheDocument()
      await screen.findByText(/Escaneá este código QR/i)
    })

    it('shows the pending label while confirming', async () => {
      server.use(
        http.post('/api/me/2fa/confirm', async () => {
          await delay(50)
          return HttpResponse.json({ backup_codes: ['AAAAA-BBBBB'] })
        })
      )
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={false} />)
      await user.click(screen.getByRole('button', { name: /Activar 2FA/i }))
      await screen.findByText(/Escaneá este código QR/i)
      await user.type(codeInput(), '123456')
      await user.click(screen.getByRole('button', { name: /Verificar y activar/i }))
      expect(await screen.findByText(/Guardando/i)).toBeInTheDocument()
      await screen.findByText(/Guardá tus códigos de respaldo/i)
    })
  })

  describe('when 2FA is enabled', () => {
    it('shows the ON state and enables the disable button only with both fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={true} />)
      expect(screen.getByText(/está activada/i)).toBeInTheDocument()
      expect(screen.getByText(/^Activo$/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      const disableBtn = screen.getByRole('button', { name: /Desactivar 2FA/i })
      expect(disableBtn).toBeDisabled() // both fields empty

      await user.type(passwordInput(), 'pw')
      expect(disableBtn).toBeDisabled() // code still empty
      await user.type(codeInput(), '123456')
      expect(disableBtn).toBeEnabled()
    })

    it('disables 2FA successfully and shows a success toast', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={true} />)
      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      await user.type(passwordInput(), 'pw')
      await user.type(codeInput(), '123456')
      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      await waitFor(() => expect(toast.success).toHaveBeenCalled())
    })

    it('shows the pending label while disabling', async () => {
      server.use(
        http.delete('/api/me/2fa', async () => {
          await delay(50)
          return new HttpResponse(null, { status: 204 })
        })
      )
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={true} />)
      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      await user.type(passwordInput(), 'pw')
      await user.type(codeInput(), '123456')
      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      expect(await screen.findByText(/Guardando/i)).toBeInTheDocument()
    })

    it('shows an error toast when disabling fails', async () => {
      server.use(http.delete('/api/me/2fa', () => new HttpResponse(null, { status: 401 })))
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={true} />)
      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      await user.type(passwordInput(), 'wrong')
      await user.type(codeInput(), '000000')
      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })

    it('cancels the disable flow', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TwoFactorSection enabled={true} />)
      await user.click(screen.getByRole('button', { name: /Desactivar 2FA/i }))
      expect(passwordInputOrNull()).not.toBeNull()
      await user.click(screen.getByRole('button', { name: /Cancelar/i }))
      await waitFor(() => expect(passwordInputOrNull()).toBeNull())
    })
  })
})
