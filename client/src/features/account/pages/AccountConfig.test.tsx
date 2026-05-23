import { describe, it, expect, beforeEach } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import i18n from '@/shared/i18n'
import {
  AccountConfig,
  validateAccountConfigForm,
  mapServerErrorToField,
  FIELD_TO_TAB,
  FIELD_ORDER,
  type AccountConfigForm,
} from './AccountConfig'

function makeForm(overrides: Partial<AccountConfigForm> = {}): AccountConfigForm {
  return {
    pendingOrdersEndpoint: '',
    webhookUrl: 'https://example.com/hook',
    pollingMethod: 'GET',
    pollingBody: '',
    authType: 'bearer',
    authToken: '',
    bankUsername: 'alice',
    bankPassword: 'secret',
    webhookExtraFields: '',
    silentIngestion: false,
    sessionType: 'one-shot',
    loginMode: 'simple',
    ...overrides,
  }
}

const t = i18n.getFixedT('es', 'account')

describe('validateAccountConfigForm', () => {
  it('flags empty bankUsername as required', () => {
    const errors = validateAccountConfigForm(
      makeForm({ bankUsername: '   ' }),
      { mode: 'passthrough', hasSavedCredential: false, t }
    )
    expect(errors.bankUsername).toBe('Requerido')
  })

  it('flags empty bankPassword as required when no saved credential', () => {
    const errors = validateAccountConfigForm(
      makeForm({ bankPassword: '' }),
      { mode: 'passthrough', hasSavedCredential: false, t }
    )
    expect(errors.bankPassword).toBe('Requerido')
  })

  it('accepts empty bankPassword when there is a saved credential', () => {
    const errors = validateAccountConfigForm(
      makeForm({ bankPassword: '' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.bankPassword).toBeUndefined()
  })

  it('flags empty webhookUrl as required', () => {
    const errors = validateAccountConfigForm(
      makeForm({ webhookUrl: '' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.webhookUrl).toBe('Requerido')
  })

  it('flags malformed webhookUrl as invalidUrl', () => {
    const errors = validateAccountConfigForm(
      makeForm({ webhookUrl: 'not a url' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.webhookUrl).toBe('URL inválida')
  })

  it('accepts a valid webhookUrl', () => {
    const errors = validateAccountConfigForm(
      makeForm({ webhookUrl: 'https://hook.example.com/x' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.webhookUrl).toBeUndefined()
  })

  it('accepts empty webhookExtraFields', () => {
    const errors = validateAccountConfigForm(
      makeForm({ webhookExtraFields: '' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.webhookExtraFields).toBeUndefined()
  })

  it('flags webhookExtraFields with malformed JSON', () => {
    const errors = validateAccountConfigForm(
      makeForm({ webhookExtraFields: '{ bad json' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.webhookExtraFields).toBe('JSON inválido')
  })

  it('flags webhookExtraFields when value is a JSON array', () => {
    const errors = validateAccountConfigForm(
      makeForm({ webhookExtraFields: '[]' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.webhookExtraFields).toBe('Debe ser un objeto JSON')
  })

  it('flags webhookExtraFields when it contains a reserved key', () => {
    const errors = validateAccountConfigForm(
      makeForm({ webhookExtraFields: '{"external_id":"x"}' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.webhookExtraFields).toContain('external_id')
  })

  it('requires pendingOrdersEndpoint in reconcile mode', () => {
    const errors = validateAccountConfigForm(
      makeForm({ pendingOrdersEndpoint: '' }),
      { mode: 'reconcile', hasSavedCredential: true, t }
    )
    expect(errors.pendingOrdersEndpoint).toBeDefined()
  })

  it('flags malformed pendingOrdersEndpoint URL in reconcile mode', () => {
    const errors = validateAccountConfigForm(
      makeForm({ pendingOrdersEndpoint: 'nope' }),
      { mode: 'reconcile', hasSavedCredential: true, t }
    )
    expect(errors.pendingOrdersEndpoint).toBe('URL inválida')
  })

  it('does not require pendingOrdersEndpoint in passthrough mode', () => {
    const errors = validateAccountConfigForm(
      makeForm({ pendingOrdersEndpoint: '' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.pendingOrdersEndpoint).toBeUndefined()
  })

  it('requires authToken in reconcile mode', () => {
    const errors = validateAccountConfigForm(
      makeForm({ authToken: '', pendingOrdersEndpoint: 'https://x.com' }),
      { mode: 'reconcile', hasSavedCredential: true, t }
    )
    expect(errors.authToken).toBe('Requerido')
  })

  it('does not require authToken in passthrough mode', () => {
    const errors = validateAccountConfigForm(
      makeForm({ authToken: '' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.authToken).toBeUndefined()
  })

  it('accepts empty pollingBody with POST method', () => {
    const errors = validateAccountConfigForm(
      makeForm({ pollingMethod: 'POST', pollingBody: '' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.pollingBody).toBeUndefined()
  })

  it('flags malformed pollingBody when method is POST', () => {
    const errors = validateAccountConfigForm(
      makeForm({ pollingMethod: 'POST', pollingBody: '{ broken' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.pollingBody).toBe('JSON inválido')
  })

  it('ignores malformed pollingBody when method is GET', () => {
    const errors = validateAccountConfigForm(
      makeForm({ pollingMethod: 'GET', pollingBody: '{ broken' }),
      { mode: 'passthrough', hasSavedCredential: true, t }
    )
    expect(errors.pollingBody).toBeUndefined()
  })
})

describe('mapServerErrorToField', () => {
  it('maps webhook_extra_fields error', () => {
    expect(mapServerErrorToField('webhook_extra_fields must be JSON')).toBe('webhookExtraFields')
  })

  it('maps webhook_url error', () => {
    expect(mapServerErrorToField('webhook_url is required')).toBe('webhookUrl')
  })

  it('maps polling_body error', () => {
    expect(mapServerErrorToField('polling_body must be valid JSON')).toBe('pollingBody')
  })

  it('maps pending_orders_endpoint error', () => {
    expect(mapServerErrorToField('pending_orders_endpoint required')).toBe('pendingOrdersEndpoint')
  })

  it('maps auth_token error', () => {
    expect(mapServerErrorToField('auth_token invalid')).toBe('authToken')
  })

  it('maps bank_password error', () => {
    expect(mapServerErrorToField('bank_password too short')).toBe('bankPassword')
  })

  it('maps bank_username error', () => {
    expect(mapServerErrorToField('bank_username missing')).toBe('bankUsername')
  })

  it('returns null when the message has no known field', () => {
    expect(mapServerErrorToField('something unrelated exploded')).toBeNull()
  })
})

describe('FIELD_TO_TAB / FIELD_ORDER constants', () => {
  it('routes credentials fields to the credentials tab', () => {
    expect(FIELD_TO_TAB.bankUsername).toBe('credentials')
    expect(FIELD_TO_TAB.bankPassword).toBe('credentials')
  })

  it('routes webhook fields to the webhooks tab', () => {
    expect(FIELD_TO_TAB.webhookUrl).toBe('webhooks')
    expect(FIELD_TO_TAB.webhookExtraFields).toBe('webhooks')
  })

  it('routes auth/orders fields to the auth-orders tab', () => {
    expect(FIELD_TO_TAB.authToken).toBe('auth-orders')
    expect(FIELD_TO_TAB.pendingOrdersEndpoint).toBe('auth-orders')
    expect(FIELD_TO_TAB.pollingBody).toBe('auth-orders')
  })

  it('puts bankUsername first in FIELD_ORDER', () => {
    expect(FIELD_ORDER[0]).toBe('bankUsername')
  })
})

function renderAccountConfig() {
  return renderWithProviders(
    <Routes>
      <Route path="/accounts/:accountId/config" element={<AccountConfig />} />
    </Routes>,
    { initialEntries: ['/accounts/acc-1/config'] }
  )
}

describe('AccountConfig page', () => {
  beforeEach(() => {
    server.use(...accountHandlers, ...userHandlers)
  })

  it('renders the page title once data is loaded', async () => {
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
  })

  it('shows the credentials tab by default', async () => {
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Credenciales bancarias')).toBeInTheDocument()
    })
  })

  it('blocks Save when required fields are missing and shows inline errors', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })

    const saveButton = screen.getByRole('button', { name: /Guardar configuración/i })
    await user.click(saveButton)

    // bankUsername is the first field in FIELD_ORDER and the API mock returns no username.
    // After Save, the page should switch to the credentials tab (where it already is) and show "Requerido".
    await waitFor(() => {
      const required = screen.getAllByText('Requerido')
      expect(required.length).toBeGreaterThan(0)
    })
  })

  it('switches to the webhooks tab when the first error lives there', async () => {
    const user = userEvent.setup()
    // Make GET /config return saved bank credentials so bankUsername/bankPassword are valid,
    // but leave webhook_url empty so webhookUrl is the first error.
    server.use(
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: null,
          webhook_url: '',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: null,
          webhook_auth_type: null,
          webhook_auth_token: null,
          notify_on_expired: false,
          webhook_extra_fields: null,
          silent_ingestion: false,
          session_type: 'one-shot',
          login_mode: 'simple',
          bank_username: 'alice',
        })
      )
    )

    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })

    const saveButton = screen.getByRole('button', { name: /Guardar configuración/i })
    await user.click(saveButton)

    // Now the Webhook URL input (which lives in the webhooks tab) should be visible after auto-switch.
    await waitFor(() => {
      expect(screen.getByText('Webhook URL (notificaciones)')).toBeInTheDocument()
    })
  })

  it('shows a server-error banner when the PUT fails with a non-mappable error', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: null,
          webhook_url: 'https://hook.example.com/x',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: null,
          webhook_auth_type: null,
          webhook_auth_token: null,
          notify_on_expired: false,
          webhook_extra_fields: null,
          silent_ingestion: false,
          session_type: 'one-shot',
          login_mode: 'simple',
          bank_username: 'alice',
        })
      ),
      http.put('/api/accounts/:accountId/config', () =>
        HttpResponse.json({ error: 'Database is on fire' }, { status: 500 })
      )
    )

    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })

    const saveButton = screen.getByRole('button', { name: /Guardar configuración/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(screen.getByText('Database is on fire')).toBeInTheDocument()
    })
  })
})
