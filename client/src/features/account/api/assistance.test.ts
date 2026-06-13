import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { getPendingAssistance, submitOtp } from './assistance'

describe('assistance api', () => {
  it('fetches the pending assistance request', async () => {
    server.use(
      http.get('/api/accounts/acc-1/otp', () =>
        HttpResponse.json({ id: 'req-1', type: 'otp', descriptor: { length: 6, type: 'numeric' }, attempts: 1 })
      )
    )
    await expect(getPendingAssistance('acc-1')).resolves.toEqual({
      id: 'req-1', type: 'otp', descriptor: { length: 6, type: 'numeric' }, attempts: 1,
    })
  })

  it('returns null when there is no pending request', async () => {
    server.use(http.get('/api/accounts/acc-1/otp', () => HttpResponse.json(null)))
    await expect(getPendingAssistance('acc-1')).resolves.toBeNull()
  })

  it('submits an OTP code', async () => {
    let body: unknown
    server.use(
      http.post('/api/accounts/acc-1/otp', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 202 })
      })
    )
    await submitOtp('acc-1', '123456')
    expect(body).toEqual({ code: '123456' })
  })
})
