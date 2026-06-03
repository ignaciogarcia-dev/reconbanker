import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { getMe, setOperationMode, enroll2fa, confirm2fa, disable2fa } from './me'

describe('user/api/me', () => {
  beforeEach(() => {
    server.use(...userHandlers)
  })

  describe('getMe', () => {
    it('maps snake_case fields incl. totp_enabled → totpEnabled', async () => {
      server.use(
        http.get('/api/me', () =>
          HttpResponse.json({ id: 'u-1', email: 'a@x', name: 'A', operation_mode: 'reconcile', totp_enabled: true })
        )
      )
      const me = await getMe()
      expect(me).toEqual({ id: 'u-1', email: 'a@x', name: 'A', operationMode: 'reconcile', totpEnabled: true })
    })

    it('defaults totpEnabled to false when the field is absent', async () => {
      server.use(
        http.get('/api/me', () =>
          HttpResponse.json({ id: 'u-1', email: 'a@x', name: null, operation_mode: null })
        )
      )
      const me = await getMe()
      expect(me.totpEnabled).toBe(false)
    })
  })

  describe('setOperationMode', () => {
    it('returns the new mode', async () => {
      const res = await setOperationMode('passthrough')
      expect(res).toEqual({ mode: 'passthrough' })
    })
  })

  describe('enroll2fa', () => {
    it('maps otpauth_uri → otpauthUri', async () => {
      const res = await enroll2fa()
      expect(res.otpauthUri).toMatch(/^otpauth:\/\/totp\//)
    })

    it('rejects on error', async () => {
      server.use(http.post('/api/me/2fa/enroll', () => new HttpResponse(null, { status: 409 })))
      await expect(enroll2fa()).rejects.toBeDefined()
    })
  })

  describe('confirm2fa', () => {
    it('sends the code and maps backup_codes → backupCodes', async () => {
      let received: unknown = null
      server.use(
        http.post('/api/me/2fa/confirm', async ({ request }) => {
          received = await request.json()
          return HttpResponse.json({ backup_codes: ['AAAAA-BBBBB'] })
        })
      )
      const res = await confirm2fa('123456')
      expect(received).toEqual({ code: '123456' })
      expect(res.backupCodes).toEqual(['AAAAA-BBBBB'])
    })

    it('rejects on a 401 (invalid code)', async () => {
      server.use(http.post('/api/me/2fa/confirm', () => new HttpResponse(null, { status: 401 })))
      await expect(confirm2fa('000000')).rejects.toBeDefined()
    })
  })

  describe('disable2fa', () => {
    it('sends password + code in the DELETE body', async () => {
      let received: unknown = null
      server.use(
        http.delete('/api/me/2fa', async ({ request }) => {
          received = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )
      await disable2fa('pw', '123456')
      expect(received).toEqual({ password: 'pw', code: '123456' })
    })

    it('rejects on a 401 (wrong password/code)', async () => {
      server.use(http.delete('/api/me/2fa', () => new HttpResponse(null, { status: 401 })))
      await expect(disable2fa('bad', '000000')).rejects.toBeDefined()
    })
  })
})
