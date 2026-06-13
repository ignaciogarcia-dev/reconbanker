import axios from 'axios'
import i18n from '@/shared/i18n'

export function resolveApiBaseUrl(value: string | undefined): string {
  const normalized = value?.trim()
  return normalized || '/api'
}

export const httpClient = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
})

// The backend returns error as a plain string from ad hoc middlewares and as { code, message, details } from the central error middleware
export function apiErrorMessage(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data
  const error = data?.error
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return undefined
  const { message, details } = error as { message?: unknown; details?: { issues?: { message?: unknown }[] } }
  const issues = details?.issues
    ?.map(i => i.message)
    .filter((m): m is string => typeof m === 'string')
  if (issues?.length) return issues.join('. ')
  return typeof message === 'string' ? message : undefined
}

// Prefers a localized message for known backend error codes and falls back to apiErrorMessage
export function localizedApiError(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data
  const error = data?.error
  if (error && typeof error === 'object') {
    const { code } = error as { code?: unknown }
    if (typeof code === 'string' && i18n.exists(`apiErrors.${code}`)) {
      return i18n.t(`apiErrors.${code}`)
    }
  }
  return apiErrorMessage(err)
}

httpClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

httpClient.interceptors.response.use(
  res => res,
  err => {
    /* v8 ignore next 1 -- axios always sets config.url on errors; `?? ''` guards against non-axios errors. */
    const url = err.config?.url ?? ''
    const isAuthEndpoint = url.startsWith('/auth/')
    if (err.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
