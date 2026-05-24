import type { AuthType, PollingMethod, SessionType, LoginMode } from '../types'

export interface AccountConfigForm {
  pendingOrdersEndpoint: string
  webhookUrl: string
  pollingMethod: PollingMethod
  pollingBody: string
  authType: AuthType
  authToken: string
  bankUsername: string
  bankPassword: string
  webhookExtraFields: string
  silentIngestion: boolean
  sessionType: SessionType
  loginMode: LoginMode
}

export type FormErrors = Partial<Record<keyof AccountConfigForm, string>>

type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export const RESERVED_WEBHOOK_KEYS = ['external_id', 'status', 'amount', 'currency', 'name', 'id', 'received_at']

export const FIELD_TO_TAB: Partial<Record<keyof AccountConfigForm, string>> = {
  bankUsername: 'credentials-session',
  bankPassword: 'credentials-session',
  webhookUrl: 'webhook',
  webhookExtraFields: 'webhook',
  pendingOrdersEndpoint: 'orders',
  pollingBody: 'orders',
  // authToken renders in 'orders' (reconcile) or 'webhook' (passthrough); resolved via resolveTabForField below.
}

// Stable order — used to determine which tab to switch to (first error wins).
// Mirrors the visual tab order: credentials → orders → webhook.
export const FIELD_ORDER: (keyof AccountConfigForm)[] = [
  'bankUsername',
  'bankPassword',
  'pendingOrdersEndpoint',
  'authToken',
  'pollingBody',
  'webhookUrl',
  'webhookExtraFields',
]

export function resolveTabForField(
  field: keyof AccountConfigForm,
  mode: string | null | undefined,
): string | undefined {
  if (field === 'authToken') return mode === 'reconcile' ? 'orders' : 'webhook'
  return FIELD_TO_TAB[field]
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

interface ValidationContext {
  mode: string | null | undefined
  hasSavedCredential: boolean
  t: TranslateFn
}

export function validateAccountConfigForm(form: AccountConfigForm, ctx: ValidationContext): FormErrors {
  const { mode, hasSavedCredential, t } = ctx
  const errors: FormErrors = {}

  // Bank credentials
  if (form.bankUsername.trim() === '') {
    errors.bankUsername = t('accountConfig.errors.required')
  }
  if (!hasSavedCredential && form.bankPassword === '') {
    errors.bankPassword = t('accountConfig.errors.required')
  }

  // Webhook URL — backend min(1) and URL format
  const webhookUrl = form.webhookUrl.trim()
  if (webhookUrl === '') {
    errors.webhookUrl = t('accountConfig.errors.required')
  } else if (!isValidUrl(webhookUrl)) {
    errors.webhookUrl = t('accountConfig.errors.invalidUrl')
  }

  // Webhook extra fields (optional, but must be valid JSON object with no reserved keys)
  const extraRaw = form.webhookExtraFields.trim()
  if (extraRaw !== '') {
    let parsed: unknown
    try {
      parsed = JSON.parse(extraRaw)
    } catch {
      errors.webhookExtraFields = t('accountConfig.errors.invalidJson')
    }
    if (errors.webhookExtraFields === undefined) {
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.webhookExtraFields = t('accountConfig.errors.mustBeObject')
      } else {
        const conflicts = Object.keys(parsed as object).filter(k => RESERVED_WEBHOOK_KEYS.includes(k))
        if (conflicts.length > 0) {
          errors.webhookExtraFields = t('accountConfig.errors.reservedKeys', { keys: conflicts.join(', ') })
        }
      }
    }
  }

  // Reconcile-mode requirements: pending orders endpoint + auth token
  if (mode === 'reconcile') {
    const endpoint = form.pendingOrdersEndpoint.trim()
    if (endpoint === '') {
      errors.pendingOrdersEndpoint = t('accountConfig.errors.pendingEndpointRequired')
    } else if (!isValidUrl(endpoint)) {
      errors.pendingOrdersEndpoint = t('accountConfig.errors.invalidUrl')
    }

    if (form.authToken.trim() === '') {
      errors.authToken = t('accountConfig.errors.required')
    }
  }

  // Polling body — only validate when POST + non-empty
  if (form.pollingMethod === 'POST') {
    const body = form.pollingBody.trim()
    if (body !== '') {
      try {
        JSON.parse(body)
      } catch {
        errors.pollingBody = t('accountConfig.errors.invalidJson')
      }
    }
  }

  return errors
}

export function mapServerErrorToField(message: string): keyof AccountConfigForm | null {
  const m = message.toLowerCase()
  if (m.includes('webhook_extra_fields') || m.includes('extra_fields')) return 'webhookExtraFields'
  if (m.includes('webhook_url') || m.includes('webhook url')) return 'webhookUrl'
  if (m.includes('polling_body')) return 'pollingBody'
  if (m.includes('pending_orders_endpoint') || m.includes('pending orders')) return 'pendingOrdersEndpoint'
  if (m.includes('auth_token')) return 'authToken'
  if (m.includes('bank_password')) return 'bankPassword'
  if (m.includes('bank_username')) return 'bankUsername'
  return null
}
