import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../../tests/msw/server'
import { renderWithProviders } from '../../../../tests/utils/render'
import { ApiKeysSection } from './ApiKeysSection'
import type { ApiKey } from '../api/apiKeys'

function key(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'k-1',
    name: 'SMS server',
    prefix: 'abcd1234',
    scopes: ['otp:write'],
    account_ids: null,
    created_at: '2026-01-01T00:00:00Z',
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  }
}

function listHandler(keys: ApiKey[]) {
  return http.get('/api/me/api-keys', () =>
    HttpResponse.json({ keys, available_scopes: ['otp:write', 'status:read'] })
  )
}

describe('ApiKeysSection', () => {
  beforeEach(() => {
    server.use(listHandler([]))
  })

  it('shows the empty state when there are no active keys', async () => {
    renderWithProviders(<ApiKeysSection />)
    expect(await screen.findByText('No hay llaves activas.')).toBeInTheDocument()
  })

  it('lists active keys with prefix and scopes, hiding revoked ones', async () => {
    server.use(
      listHandler([
        key(),
        key({ id: 'k-2', name: 'Old key', revoked_at: '2026-02-01T00:00:00Z' }),
      ])
    )
    renderWithProviders(<ApiKeysSection />)

    expect(await screen.findByText('SMS server')).toBeInTheDocument()
    expect(screen.getByText('rbk_abcd1234_…')).toBeInTheDocument()
    expect(screen.getAllByText('otp:write').length).toBeGreaterThan(1)
    expect(screen.queryByText('Old key')).not.toBeInTheDocument()
  })

  it('explains each scope with a title and the endpoint it enables', async () => {
    renderWithProviders(<ApiKeysSection />)

    await screen.findByText('No hay llaves activas.')
    expect(screen.getByText('Enviar código OTP')).toBeInTheDocument()
    expect(screen.getByText('Leer estado de la cuenta')).toBeInTheDocument()
    expect(screen.getAllByText('Endpoint')).toHaveLength(2)
    expect(screen.getByText(/\/v1\/accounts\/\{accountId\}\/otp/)).toBeInTheDocument()
    expect(screen.getByText(/\/v1\/accounts\/\{accountId\}\/status/)).toBeInTheDocument()
  })

  it('creates a key, reveals the secret once, copies and dismisses it', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    let created: unknown
    server.use(
      http.post('/api/me/api-keys', async ({ request }) => {
        created = await request.json()
        return HttpResponse.json({ ...key(), key: 'rbk_abcd1234_secret' }, { status: 201 })
      })
    )
    renderWithProviders(<ApiKeysSection />)

    await screen.findByText('No hay llaves activas.')
    // Toggle scopes: remove the default otp:write, add status:read, then re-add otp:write.
    await user.click(screen.getByRole('checkbox', { name: /otp:write/ }))
    expect(screen.getByRole('button', { name: /Crear llave/ })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /status:read/ }))
    await user.click(screen.getByRole('checkbox', { name: /otp:write/ }))
    await user.type(screen.getByLabelText('Nombre'), '  My key  ')
    await user.click(screen.getByRole('button', { name: /Crear llave/ }))

    expect(await screen.findByText('Copiá y guardá esta llave ahora')).toBeInTheDocument()
    expect(screen.getByText('rbk_abcd1234_secret')).toBeInTheDocument()
    expect(created).toEqual({ name: 'My key', scopes: ['status:read', 'otp:write'], account_ids: null })
    expect(await screen.findByText('Llave creada')).toBeInTheDocument()
    // Form resets after creation
    expect(screen.getByLabelText('Nombre')).toHaveValue('')

    // Copy succeeds and the check icon reverts after the timeout.
    const copyButton = screen.getByText('rbk_abcd1234_secret').parentElement!.querySelector('button')!
    await user.click(copyButton)
    expect(writeText).toHaveBeenCalledWith('rbk_abcd1234_secret')
    await waitFor(
      () => expect(copyButton.querySelector('svg.lucide-check')).not.toBeInTheDocument(),
      { timeout: 3000 }
    )
    // Copy again with a failing clipboard: the rejection is swallowed.
    await user.click(copyButton)
    expect(writeText).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.queryByText('rbk_abcd1234_secret')).not.toBeInTheDocument()
  })

  it('shows the pending label while creation is in flight', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/me/api-keys', async () => {
        await delay(50)
        return HttpResponse.json({ ...key(), key: 'rbk_abcd1234_secret' }, { status: 201 })
      })
    )
    renderWithProviders(<ApiKeysSection />)

    await screen.findByText('No hay llaves activas.')
    await user.type(screen.getByLabelText('Nombre'), 'My key')
    await user.click(screen.getByRole('button', { name: /Crear llave/ }))

    expect(await screen.findByText('Creando…')).toBeInTheDocument()
    expect(await screen.findByText('Llave creada')).toBeInTheDocument()
  })

  it('shows the localized backend error when creation fails with a known code', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/me/api-keys', () =>
        HttpResponse.json({ error: { code: 'CONFLICT', message: 'nope' } }, { status: 400 })
      )
    )
    renderWithProviders(<ApiKeysSection />)

    await screen.findByText('No hay llaves activas.')
    await user.type(screen.getByLabelText('Nombre'), 'Bad key')
    await user.click(screen.getByRole('button', { name: /Crear llave/ }))

    expect(await screen.findByText('Ya existe un registro con esos datos')).toBeInTheDocument()
  })

  it('falls back to the generic create error when the backend gives no message', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/me/api-keys', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<ApiKeysSection />)

    await screen.findByText('No hay llaves activas.')
    await user.type(screen.getByLabelText('Nombre'), 'Bad key')
    await user.click(screen.getByRole('button', { name: /Crear llave/ }))

    expect(await screen.findByText('No se pudo crear la llave')).toBeInTheDocument()
  })

  it('revokes a key and refreshes the list', async () => {
    const user = userEvent.setup()
    let revokedId: string | null = null
    server.use(
      http.get('/api/me/api-keys', () =>
        HttpResponse.json({
          keys: revokedId ? [] : [key()],
          available_scopes: ['otp:write', 'status:read'],
        })
      ),
      http.delete('/api/me/api-keys/:id', ({ params }) => {
        revokedId = params.id as string
        return new HttpResponse(null, { status: 204 })
      })
    )
    renderWithProviders(<ApiKeysSection />)

    await screen.findByText('SMS server')
    await user.click(screen.getByRole('button', { name: 'Revocar' }))

    expect(await screen.findByText('Llave revocada')).toBeInTheDocument()
    expect(revokedId).toBe('k-1')
    expect(await screen.findByText('No hay llaves activas.')).toBeInTheDocument()
  })
})
