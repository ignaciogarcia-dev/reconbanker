import { http, HttpResponse } from 'msw'

export const userHandlers = [
  http.get('/api/me', () =>
    HttpResponse.json({
      id: 'u-1',
      email: 'test@x',
      name: 'T',
      operation_mode: 'passthrough',
      totp_enabled: false,
    })
  ),
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.email === 'fail@x' || body.password === 'wrong') {
      return new HttpResponse(JSON.stringify({ error: 'invalid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (body.email === '2fa@x') {
      return HttpResponse.json({ requiresTotp: true, challengeToken: 'challenge-token' })
    }
    return HttpResponse.json({
      token: 'fresh-token',
      user: { id: 'u-1', email: body.email, name: 'T' },
    })
  }),
  http.post('/api/auth/login/totp', async ({ request }) => {
    const body = (await request.json()) as { challengeToken: string; code: string }
    if (body.code !== '123456') {
      return new HttpResponse(JSON.stringify({ error: 'invalid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return HttpResponse.json({
      token: 'fresh-token',
      user: { id: 'u-1', email: 'test@x', name: 'T' },
    })
  }),
  http.post('/api/me/2fa/enroll', () =>
    HttpResponse.json({ otpauth_uri: 'otpauth://totp/ReconBanker:test@x?secret=ABC' })
  ),
  http.post('/api/me/2fa/confirm', () =>
    HttpResponse.json({ backup_codes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] })
  ),
  http.delete('/api/me/2fa', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as { email: string }
    if (body.email === 'taken@x') {
      return new HttpResponse(
        JSON.stringify({ error: 'Email already in use' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    return HttpResponse.json({ id: 'u-new', email: body.email })
  }),
  http.put('/api/me/operation-mode', async ({ request }) => {
    const body = (await request.json()) as { mode: 'reconcile' | 'passthrough' }
    return HttpResponse.json({ operation_mode: body.mode })
  }),
]
