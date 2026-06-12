import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/msw/server'
import { httpClient, resolveApiBaseUrl, apiErrorMessage, localizedApiError } from './client'
import i18n from '@/shared/i18n'

describe('httpClient', () => {
  it('uses the api prefix by default', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api')
  })

  it('falls back to the api prefix when the env var is empty', () => {
    expect(resolveApiBaseUrl('')).toBe('/api')
    expect(resolveApiBaseUrl('   ')).toBe('/api')
  })

  it('uses a custom api base url when configured', () => {
    expect(resolveApiBaseUrl('https://api.example.com')).toBe('https://api.example.com')
  })
})

describe('apiErrorMessage', () => {
  const axiosErr = (error: unknown) => ({ response: { data: { error } } })

  it('returns string errors from ad hoc middlewares as is', () => {
    expect(apiErrorMessage(axiosErr('Unauthorized'))).toBe('Unauthorized')
  })

  it('returns the message of structured errors', () => {
    expect(apiErrorMessage(axiosErr({ code: 'RATE_LIMITED', message: 'Too many requests' }))).toBe('Too many requests')
  })

  it('joins validation issue messages', () => {
    const error = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid body',
      details: { source: 'body', issues: [{ message: 'Invalid email address' }, { message: 'Password too short' }] },
    }
    expect(apiErrorMessage(axiosErr(error))).toBe('Invalid email address. Password too short')
  })

  it('falls back to message when issues are malformed', () => {
    const error = { message: 'Invalid body', details: { issues: [{ message: 42 }] } }
    expect(apiErrorMessage(axiosErr(error))).toBe('Invalid body')
  })

  it('returns undefined for malformed or non axios errors', () => {
    expect(apiErrorMessage(axiosErr({ code: 'X' }))).toBeUndefined()
    expect(apiErrorMessage(axiosErr(null))).toBeUndefined()
    expect(apiErrorMessage(new Error('boom'))).toBeUndefined()
    expect(apiErrorMessage(undefined)).toBeUndefined()
  })
})

describe('localizedApiError', () => {
  const axiosErr = (error: unknown) => ({ response: { data: { error } } })

  it('returns the localized message for known codes when the language is spanish', async () => {
    await i18n.changeLanguage('es')
    expect(localizedApiError(axiosErr({ code: 'RATE_LIMITED', message: 'Too many requests' }))).toBe(
      'Demasiados intentos. Probá de nuevo en unos minutos'
    )
  })

  it('falls back to the raw message for unknown codes', () => {
    expect(localizedApiError(axiosErr({ code: 'WEIRD_CODE', message: 'Something odd' }))).toBe('Something odd')
  })

  it('falls back to the string error from ad hoc middlewares', () => {
    expect(localizedApiError(axiosErr('plain failure'))).toBe('plain failure')
  })
})

describe('httpClient interceptors', () => {
  const originalLocation = window.location

  beforeEach(() => {
    localStorage.clear()
    // Replace `location` with a writable stub so the 401 interceptor's
    // `window.location.href = '/login'` is observable without a real navigation.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: Object.assign({}, originalLocation, {
        href: 'http://localhost/',
        assign: () => {},
        replace: () => {},
      }),
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    })
  })

  it('attaches the bearer token from localStorage on requests', async () => {
    localStorage.setItem('token', 'abc-123')
    let authHeader: string | null = null
    server.use(
      http.get('/api/ping', ({ request }) => {
        authHeader = request.headers.get('authorization')
        return HttpResponse.json({ ok: true })
      })
    )

    await httpClient.get('/ping')
    expect(authHeader).toBe('Bearer abc-123')
  })

  it('removes the token and redirects to /login on 401 from a non-auth endpoint', async () => {
    localStorage.setItem('token', 'abc-123')
    server.use(
      http.get('/api/protected', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
      )
    )

    await expect(httpClient.get('/protected')).rejects.toBeDefined()
    expect(localStorage.getItem('token')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('does not clear the token or redirect on 401 from auth endpoints', async () => {
    localStorage.setItem('token', 'abc-123')
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'invalid creds' }, { status: 401 })
      )
    )

    await expect(httpClient.post('/auth/login', {})).rejects.toBeDefined()
    expect(localStorage.getItem('token')).toBe('abc-123')
    expect(window.location.href).toBe('http://localhost/')
  })

  it('rejects with the original error for non-401 responses', async () => {
    server.use(
      http.get('/api/oops', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 })
      )
    )

    await expect(httpClient.get('/oops')).rejects.toBeDefined()
    expect(window.location.href).toBe('http://localhost/')
  })
})
