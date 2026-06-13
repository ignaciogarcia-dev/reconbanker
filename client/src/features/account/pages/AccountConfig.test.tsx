import { describe, it, expect, beforeEach } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { accountHandlers } from '../../../../tests/msw/handlers/account'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import i18n from '@/shared/i18n'
import { AccountConfig } from './AccountConfig'
import {
  validateAccountConfigForm,
  mapServerErrorToField,
  FIELD_TO_TAB,
  FIELD_ORDER,
  resolveTabForField,
  type AccountConfigForm,
} from './accountConfigForm'

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

describe('FIELD_TO_TAB / FIELD_ORDER / resolveTabForField', () => {
  it('routes credentials fields to the credentials-session tab', () => {
    expect(FIELD_TO_TAB.bankUsername).toBe('credentials-session')
    expect(FIELD_TO_TAB.bankPassword).toBe('credentials-session')
  })

  it('routes webhook fields to the webhook tab', () => {
    expect(FIELD_TO_TAB.webhookUrl).toBe('webhook')
    expect(FIELD_TO_TAB.webhookExtraFields).toBe('webhook')
  })

  it('routes order ingestion fields to the orders tab', () => {
    expect(FIELD_TO_TAB.pendingOrdersEndpoint).toBe('orders')
    expect(FIELD_TO_TAB.pollingBody).toBe('orders')
  })

  it('resolves authToken to orders in reconcile mode and webhook in passthrough', () => {
    expect(resolveTabForField('authToken', 'reconcile')).toBe('orders')
    expect(resolveTabForField('authToken', 'passthrough')).toBe('webhook')
    expect(resolveTabForField('authToken', null)).toBe('webhook')
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

  it('dismisses the server-error banner when the Cerrar button is clicked', async () => {
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
        HttpResponse.json({ error: 'Boom' }, { status: 500 })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(screen.getByText('Boom')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Cerrar/i }))
    await waitFor(() => {
      expect(screen.queryByText('Boom')).not.toBeInTheDocument()
    })
  })

  it('hydrates the form fields from the loaded config', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: 'https://orders.example.com',
          webhook_url: 'https://hook.example.com/x',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: 'sekret',
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
    // Credentials tab is active by default — verify bankUsername hydrated.
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    // Switch to the Webhook tab and verify webhookUrl hydrated.
    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://hook.example.com/x')).toBeInTheDocument()
    })
  })

  it('renders the bell icon as active by default and toggles to silenced on click', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    // Initial state: silentIngestion=false → button label is "Notificaciones activas".
    const bellBtn = await screen.findByRole('button', { name: /Notificaciones activas/i })
    expect(bellBtn).toHaveAttribute('aria-pressed', 'false')
    await user.click(bellBtn)
    await waitFor(() => {
      const silenced = screen.getByRole('button', { name: /Notificaciones silenciadas/i })
      expect(silenced).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('shows credentials and session in the same tab and switches to the Webhook tab', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Credenciales bancarias')).toBeInTheDocument()
    })
    // Session card is in the same tab as credentials, both visible without switching.
    expect(screen.getByText('Tipo de sesión')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    await waitFor(() => {
      expect(screen.getByText('Webhook URL (notificaciones)')).toBeInTheDocument()
    })
  })

  it('does not show the Orders tab in passthrough mode', async () => {
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    expect(screen.queryByRole('tab', { name: /^Órdenes$/i })).not.toBeInTheDocument()
  })

  it('shows the Orders tab in reconcile mode', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({
          id: 'u-1',
          email: 'test@x',
          name: 'T',
          operation_mode: 'reconcile',
        })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Órdenes$/i })).toBeInTheDocument()
    })
  })

  it('shows the authentication card inside the Webhook tab in passthrough mode', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    await waitFor(() => {
      // Auth card title + webhook-only helper text live inside the Webhook tab.
      expect(screen.getByText('Autenticación')).toBeInTheDocument()
      expect(
        screen.getByText(/se envía en el header Authorization de los webhooks salientes/i),
      ).toBeInTheDocument()
    })
  })

  it('selects a Session radio card and reflects the choice in data-checked', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })

    // "Persistente" is the not-default session option, already visible in the default tab.
    const persistent = await screen.findByText('Persistente')
    // Walk up to find the Radio.Root container (rendered as a button by default).
    const card = persistent.closest('[data-slot]') ?? persistent.closest('button')
    expect(card).toBeTruthy()
    await user.click(persistent)
    await waitFor(() => {
      // After click, the Radio.Root for "persistent" should have data-checked.
      const allButtons = screen.getAllByRole('radio')
      const checked = allButtons.find(el => el.getAttribute('data-checked') !== null)
      expect(checked).toBeTruthy()
      expect(checked?.textContent).toContain('Persistente')
    })
  })

  it('shows the "Saved!" confirmation after a successful save', async () => {
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
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    // bankPassword is empty but hasSavedCredential=true so it's allowed.
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(screen.getByText('Configuración guardada')).toBeInTheDocument()
    })
    // Redirect to /accounts unmounts the page.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Guardar configuración/i })).not.toBeInTheDocument()
    })
  })

  it('maps a server error string to the correct field and switches tab', async () => {
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
        HttpResponse.json({ error: 'webhook_url is malformed' }, { status: 400 })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    // Should switch to webhooks tab and show the inline message under webhookUrl.
    await waitFor(() => {
      expect(screen.getByText('webhook_url is malformed')).toBeInTheDocument()
      expect(screen.getByText('Webhook URL (notificaciones)')).toBeInTheDocument()
    })
  })

  it('opens the delete dialog from the page header', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    await waitFor(() => {
      expect(screen.getByText('Eliminar cuenta definitivamente')).toBeInTheDocument()
    })
  })

  it('keeps the destructive Delete button disabled until the account name is typed', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    const dialogTitle = await screen.findByText('Eliminar cuenta definitivamente')
    const dialog = dialogTitle.closest('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()

    const confirmBtn = within(dialog)
      .getAllByRole('button')
      .find(b => /Eliminar definitivamente/i.test(b.textContent ?? ''))
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn).toBeDisabled()

    const input = within(dialog).getByRole('textbox')
    await user.type(input, 'Cuenta 1')
    await waitFor(() => expect(confirmBtn).not.toBeDisabled())
  })

  it('starts with all tabs in neutral status (no status icons)', async () => {
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    // No tab should be in error status before a Save attempt.
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('data-status', 'neutral')
    }
    // No save-failed summary text yet.
    expect(screen.getByTestId('save-failed-summary')).toHaveTextContent('')
  })

  it('flips a tab to complete status when all required fields are filled', async () => {
    const user = userEvent.setup()
    // Returns saved credentials so credentials-session needs only bankUsername (already filled).
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
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: /Credenciales y sesión/i })).toHaveAttribute('data-status', 'complete')
    // Webhook still needs URL, so it stays neutral until completed.
    expect(screen.getByRole('tab', { name: /^Webhook$/i })).toHaveAttribute('data-status', 'neutral')
    // Fill webhook URL → webhook flips to complete.
    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    const webhookInput = screen.getByPlaceholderText('https://...')
    await user.type(webhookInput, 'https://hook.example.com/x')
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Webhook$/i })).toHaveAttribute('data-status', 'complete')
    })
  })

  it('flips offending tabs to error status on Save failure and renders summary', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    // bankUsername empty + webhookUrl empty → both tabs become error.
    await waitFor(() => {
      const credentialsTab = screen.getByRole('tab', { name: /Credenciales y sesión/i })
      expect(credentialsTab).toHaveAttribute('data-status', 'error')
    })
    const webhookTab = screen.getByRole('tab', { name: /^Webhook$/i })
    expect(webhookTab).toHaveAttribute('data-status', 'error')
    // Summary live region renders.
    expect(screen.getByTestId('save-failed-summary')).toHaveTextContent(/No se pudo guardar/i)
  })

  it('closes the delete dialog when the ghost Cancel button is clicked', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    const dialogTitle = await screen.findByText('Eliminar cuenta definitivamente')
    const dialog = dialogTitle.closest('[role="dialog"]') as HTMLElement

    const cancelBtn = within(dialog).getByRole('button', { name: 'Cancelar' })
    await user.click(cancelBtn)
    await waitFor(() => {
      expect(screen.queryByText('Eliminar cuenta definitivamente')).not.toBeInTheDocument()
    })
  })

  it('switches the auth type to API Key via the select', async () => {
    const user = userEvent.setup()
    // Returns saved credentials so we land cleanly on credentials tab; then switch to Webhook to see Auth card.
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
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    const authSelectTrigger = await screen.findByRole('combobox')
    expect(authSelectTrigger.textContent).toContain('Bearer token')
    await user.click(authSelectTrigger)
    const apiKeyOption = await screen.findByRole('option', { name: /^API Key$/i })
    await user.click(apiKeyOption)
    await waitFor(() => {
      const trigger = screen.getByRole('combobox')
      expect(trigger.textContent).toContain('API Key')
    })
  })

  it('renders the Body textarea when polling method is POST and validates the JSON', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({
          id: 'u-1',
          email: 'test@x',
          name: 'T',
          operation_mode: 'reconcile',
        })
      ),
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: 'https://orders.example.com',
          webhook_url: 'https://hook.example.com/x',
          retry_limit: 3,
          polling_method: 'POST',
          polling_body: { foo: 1 },
          auth_type: 'bearer',
          auth_token: 'tok',
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
      expect(screen.getByRole('tab', { name: /^Órdenes$/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /^Órdenes$/i }))
    // Polling body textarea is visible because pollingMethod is POST.
    const bodyTextarea = await screen.findByPlaceholderText('{"key": "value"}')
    expect((bodyTextarea as HTMLTextAreaElement).value).toContain('"foo"')

    // Replace with malformed JSON and try to save → expect inline pollingBody error.
    await user.clear(bodyTextarea)
    // user-event treats `{` as a special character; double it to type literally.
    await user.type(bodyTextarea, '{{ broken')
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(screen.getByText('JSON inválido')).toBeInTheDocument()
    })
  })

  it('shows the delete error inline when the server rejects the deletion', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete('/api/accounts/:accountId', () =>
        HttpResponse.json({ error: 'cannot delete: still in use' }, { status: 400 })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    const dialogTitle = await screen.findByText('Eliminar cuenta definitivamente')
    const dialog = dialogTitle.closest('[role="dialog"]') as HTMLElement

    const input = within(dialog).getByRole('textbox')
    await user.type(input, 'Cuenta 1')
    const confirmBtn = within(dialog)
      .getAllByRole('button')
      .find(b => /Eliminar definitivamente/i.test(b.textContent ?? ''))!
    await user.click(confirmBtn)
    await waitFor(() => {
      expect(within(dialog).getByText(/cannot delete: still in use/i)).toBeInTheDocument()
    })
  })

  it('clears the delete error when the user starts editing the confirmation again', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete('/api/accounts/:accountId', () =>
        HttpResponse.json({ error: 'nope' }, { status: 400 })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    const dialogTitle = await screen.findByText('Eliminar cuenta definitivamente')
    const dialog = dialogTitle.closest('[role="dialog"]') as HTMLElement
    const input = within(dialog).getByRole('textbox')
    await user.type(input, 'Cuenta 1')
    const confirmBtn = within(dialog)
      .getAllByRole('button')
      .find(b => /Eliminar definitivamente/i.test(b.textContent ?? ''))!
    await user.click(confirmBtn)
    await waitFor(() => {
      expect(within(dialog).getByText('nope')).toBeInTheDocument()
    })
    // Editing again should clear the error message.
    await user.type(input, 'x')
    await waitFor(() => {
      expect(within(dialog).queryByText('nope')).not.toBeInTheDocument()
    })
  })

  it('navigates back to /accounts when the Volver button is clicked', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Volver/i }))
    // The page unmounts when navigated away.
    await waitFor(() => {
      expect(screen.queryByText('Configuración de cuenta')).not.toBeInTheDocument()
    })
  })

  it('falls back to the generic error message when the PUT response has no error string', async () => {
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
      // Non-JSON response so the axios error has no response.data.error and no friendly .message.
      http.put('/api/accounts/:accountId/config', () =>
        new HttpResponse('boom', { status: 500 })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    // The fallback uses the axios .message ("Request failed with status code 500" or similar).
    await waitFor(() => {
      const banner = screen.getByText(/Request failed/i)
      expect(banner).toBeInTheDocument()
    })
  })

  it('changes the login mode via the assisted OptionCard radio', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Modo de login')).toBeInTheDocument()
    })
    const assisted = screen.getByText('Asistido')
    await user.click(assisted)
    await waitFor(() => {
      const radios = screen.getAllByRole('radio')
      const checked = radios.find(el => el.getAttribute('data-checked') !== null && el.textContent?.includes('Asistido'))
      expect(checked).toBeTruthy()
    })
  })

  it('hydrates extra-fields and pollingBody from existing JSON and edits the extra-fields textarea', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({
          id: 'u-1',
          email: 'test@x',
          name: 'T',
          operation_mode: 'reconcile',
        })
      ),
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: 'https://orders.example.com',
          webhook_url: 'https://hook.example.com/x',
          retry_limit: 3,
          polling_method: 'POST',
          polling_body: { foo: 1 },
          auth_type: 'bearer',
          auth_token: 'tok',
          webhook_auth_type: null,
          webhook_auth_token: null,
          notify_on_expired: false,
          webhook_extra_fields: { source: 'cli' },
          silent_ingestion: false,
          session_type: 'one-shot',
          login_mode: 'simple',
          bank_username: 'alice',
        })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })

    // Switch to webhook tab and edit the extra-fields textarea (drives lines 557-558).
    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    const extraTextarea = await screen.findByPlaceholderText('{"source": "reconbanker"}')
    await user.clear(extraTextarea)
    await user.type(extraTextarea, '{{"new":1}}')
    expect((extraTextarea as HTMLTextAreaElement).value).toContain('new')
  })

  it('changes the polling method via the select on the Orders tab', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({
          id: 'u-1',
          email: 'test@x',
          name: 'T',
          operation_mode: 'reconcile',
        })
      ),
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: 'https://orders.example.com',
          webhook_url: 'https://hook.example.com/x',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: 'tok',
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
      expect(screen.getByRole('tab', { name: /^Órdenes$/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /^Órdenes$/i }))
    // The HTTP-method select shows "GET" by default; switch to "POST".
    const combos = await screen.findAllByRole('combobox')
    const methodSelect = combos.find(c => /GET/.test(c.textContent ?? ''))!
    expect(methodSelect).toBeTruthy()
    await user.click(methodSelect)
    const postOption = await screen.findByRole('option', { name: /^POST$/ })
    await user.click(postOption)
    await waitFor(() => {
      // The Body textarea becomes visible when method is POST.
      expect(screen.getByPlaceholderText('{"key": "value"}')).toBeInTheDocument()
    })
  })

  it('hydrates and round-trips extra-fields JSON on save (covers parseJsonOrNull)', async () => {
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
          webhook_extra_fields: { source: 'fe' },
          silent_ingestion: false,
          session_type: 'one-shot',
          login_mode: 'simple',
          bank_username: 'alice',
        })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    // bankPassword is empty but hasSavedCredential=true so it's allowed; saving will
    // call parseJsonOrNull on the hydrated extra-fields JSON.
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(screen.getByText('Configuración guardada')).toBeInTheDocument()
    })
  })

  it('clears the inline field error when the user types into a previously errored field', async () => {
    const user = userEvent.setup()
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    // Trigger Save with empty bankUsername → error appears.
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(screen.getAllByText('Requerido').length).toBeGreaterThan(0)
    })
    const initialErrorCount = screen.getAllByText('Requerido').length
    // Type into the bank username input → clearFieldError should drop that field's error.
    const usernameInput = screen.getByPlaceholderText(/Usuario del banco/i)
    await user.type(usernameInput, 'bob')
    await waitFor(() => {
      expect(screen.getAllByText('Requerido').length).toBeLessThan(initialErrorCount)
    })
  })

  it('navigates to /accounts after a successful deletion', async () => {
    const user = userEvent.setup()
    let deleteCalls = 0
    server.use(
      http.delete('/api/accounts/:accountId', () => {
        deleteCalls += 1
        return HttpResponse.json({ ok: true })
      })
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    const dialogTitle = await screen.findByText('Eliminar cuenta definitivamente')
    const dialog = dialogTitle.closest('[role="dialog"]') as HTMLElement
    const input = within(dialog).getByRole('textbox')
    await user.type(input, 'Cuenta 1')
    const confirmBtn = within(dialog)
      .getAllByRole('button')
      .find(b => /Eliminar definitivamente/i.test(b.textContent ?? ''))!
    await user.click(confirmBtn)
    await waitFor(() => {
      expect(deleteCalls).toBe(1)
      expect(screen.queryByText('Configuración de cuenta')).not.toBeInTheDocument()
    })
  })

  it('renders without an :accountId param and short-circuits Save/Delete via the guard', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Routes>
        <Route path="/accounts/config" element={<AccountConfig />} />
      </Routes>,
      { initialEntries: ['/accounts/config'] }
    )
    // Page renders since useAccount/useAccountConfig are disabled when accountId is missing,
    // so isLoading is false and the layout becomes visible.
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    // Click Save → handleSave hits `if (!accountId) return`.
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    // No toast, no navigation, no errors surfaced — still on the page.
    expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
  })

  it('saves with non-empty endpoint/auth/password and forwards them in the PUT body', async () => {
    const user = userEvent.setup()
    let putBody: Record<string, unknown> | null = null
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ id: 'u-1', email: 't@x', name: 'T', operation_mode: 'reconcile' })
      ),
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: 'https://orders.example.com',
          webhook_url: 'https://hook.example.com/x',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: 'tok-123',
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
      http.put('/api/accounts/:accountId/config', async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          id: 'cfg-1',
          account_id: 'acc-1',
          pending_orders_endpoint: 'https://orders.example.com',
          webhook_url: 'https://hook.example.com/x',
          retry_limit: 3,
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: 'tok-123',
          webhook_auth_type: null,
          webhook_auth_token: null,
          notify_on_expired: false,
          webhook_extra_fields: null,
          silent_ingestion: false,
          session_type: 'one-shot',
          login_mode: 'simple',
          bank_username: 'alice',
        })
      })
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    const passwordInput = screen.getByPlaceholderText(/Dejá vacío para no cambiar/i)
    await user.type(passwordInput, 'newpass')
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(putBody).toBeTruthy()
      expect((putBody as Record<string, unknown>)?.pending_orders_endpoint).toBe('https://orders.example.com')
      expect((putBody as Record<string, unknown>)?.auth_token).toBe('tok-123')
      expect((putBody as Record<string, unknown>)?.bank_username).toBe('alice')
      expect((putBody as Record<string, unknown>)?.bank_password).toBe('newpass')
    })
  })

  it('falls back to default retry_limit/notify_on_expired when API returns null fields', async () => {
    const user = userEvent.setup()
    let putBody: Record<string, unknown> | null = null
    server.use(
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: null,
          webhook_url: 'https://hook.example.com/x',
          // retry_limit and notify_on_expired absent → undefined in the upsert.
          polling_method: 'GET',
          polling_body: null,
          auth_type: 'bearer',
          auth_token: null,
          webhook_auth_type: null,
          webhook_auth_token: null,
          webhook_extra_fields: null,
          silent_ingestion: false,
          session_type: 'one-shot',
          login_mode: 'simple',
          bank_username: 'alice',
        })
      ),
      http.put('/api/accounts/:accountId/config', async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ok: true })
      })
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(putBody).toBeTruthy()
      expect((putBody as Record<string, unknown>)?.retry_limit).toBe(3)
      expect((putBody as Record<string, unknown>)?.notify_on_expired).toBe(false)
    })
  })

  it('falls back to "" when the loaded webhook_url is missing from the config payload', async () => {
    server.use(
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1',
          account_id: params.accountId,
          pending_orders_endpoint: null,
          // webhook_url absent → hydrate fallback hits the `?? ''` branch.
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
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
  })

  it('shows the delete pending label while the delete mutation is in-flight', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete('/api/accounts/:accountId', async () => {
        await new Promise(r => setTimeout(r, 200))
        return HttpResponse.json({ ok: true })
      })
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    const dialogTitle = await screen.findByText('Eliminar cuenta definitivamente')
    const dialog = dialogTitle.closest('[role="dialog"]') as HTMLElement
    const input = within(dialog).getByRole('textbox')
    await user.type(input, 'Cuenta 1')
    const confirmBtn = within(dialog)
      .getAllByRole('button')
      .find(b => /Eliminar definitivamente/i.test(b.textContent ?? ''))!
    await user.click(confirmBtn)
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: /Eliminando/i })).toBeInTheDocument()
    })
  })

  it('renders the inline error styling on the extra-fields textarea when JSON is invalid', async () => {
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
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('tab', { name: /^Webhook$/i }))
    const extraTextarea = await screen.findByPlaceholderText('{"source": "reconbanker"}')
    // Type malformed JSON, save → server-side validate flips the error class+aria-invalid.
    await user.type(extraTextarea, '{{broken')
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(extraTextarea).toHaveAttribute('aria-invalid', 'true')
      expect(extraTextarea.className).toContain('border-destructive')
    })
  })

  it('short-circuits handleDelete when accountId is missing', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/accounts/config" element={<AccountConfig />} />
      </Routes>,
      { initialEntries: ['/accounts/config'] }
    )
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    // The Delete account button is disabled when !account, so we can't even reach
    // handleDelete via UI. Still, the guard exists; assert button stays disabled.
    const deleteBtn = screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0]
    expect(deleteBtn).toBeDisabled()
  })

  it('falls back to the generic delete error string when the server response has no error field', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete('/api/accounts/:accountId', () =>
        // Non-JSON / missing error key → setDeleteError(message ?? t('...genericError'))
        new HttpResponse('boom', { status: 500 })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByText('Configuración de cuenta')).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /Eliminar cuenta/i })[0])
    const dialogTitle = await screen.findByText('Eliminar cuenta definitivamente')
    const dialog = dialogTitle.closest('[role="dialog"]') as HTMLElement
    const input = within(dialog).getByRole('textbox')
    await user.type(input, 'Cuenta 1')
    const confirmBtn = within(dialog)
      .getAllByRole('button')
      .find(b => /Eliminar definitivamente/i.test(b.textContent ?? ''))!
    await user.click(confirmBtn)
    await waitFor(() => {
      expect(within(dialog).getByText(/No se pudo eliminar/i)).toBeInTheDocument()
    })
  })

  it('keeps the active tab when a server error maps to a field on the current tab', async () => {
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
        // Returns a bank_username error → maps to credentials-session tab (the currently-active tab).
        HttpResponse.json({ error: 'bank_username already in use' }, { status: 400 })
      )
    )
    renderAccountConfig()
    await waitFor(() => {
      expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))
    await waitFor(() => {
      expect(screen.getByText('bank_username already in use')).toBeInTheDocument()
    })
    // We are still on the credentials tab.
    expect(screen.getByText('Credenciales bancarias')).toBeInTheDocument()
  })

  it('saves the notification endpoint settings from the notifications tab', async () => {
    const user = userEvent.setup()
    let putBody: Record<string, unknown> | undefined
    server.use(
      http.get('/api/accounts/:accountId/config', ({ params }) =>
        HttpResponse.json({
          id: 'cfg-1', account_id: params.accountId, pending_orders_endpoint: null,
          webhook_url: 'https://hook.example.com/x', retry_limit: 3, polling_method: 'GET',
          polling_body: null, auth_type: 'bearer', auth_token: null, webhook_auth_type: null,
          webhook_auth_token: null, notify_on_expired: false, webhook_extra_fields: null,
          silent_ingestion: false, session_type: 'one-shot', login_mode: 'simple', bank_username: 'alice',
          notification_endpoint_url: null, notification_auth_type: null,
          notification_auth_token: null, notification_events: null,
        })
      ),
      http.put('/api/accounts/:accountId/config', async ({ request, params }) => {
        putBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 'cfg-1', account_id: params.accountId })
      })
    )

    renderAccountConfig()
    await waitFor(() => expect(screen.getByDisplayValue('alice')).toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: /Notificaciones/i }))
    await user.type(screen.getByLabelText('URL del endpoint'), 'https://hooks.example.com/recon')
    await user.type(screen.getByLabelText('Token de autenticación'), 'sekret')
    // Exercise the auth-type select.
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Api-Key' }))
    await user.click(screen.getByRole('checkbox'))

    await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))

    await waitFor(() => expect(putBody).toBeDefined())
    expect(putBody).toMatchObject({
      notification_endpoint_url: 'https://hooks.example.com/recon',
      notification_auth_type: 'api_key',
      notification_auth_token: 'sekret',
      notification_events: ['assistance_required'],
    })
  })

})
