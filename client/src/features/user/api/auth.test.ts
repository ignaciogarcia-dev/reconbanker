import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import {
  login,
  register,
  logoutLocal,
  readStoredUser,
  persistSession,
} from './auth'

describe('user/api/auth', () => {
  beforeEach(() => {
    localStorage.clear()
    server.use(...userHandlers)
  })

  describe('login', () => {
    it('returns token and user on success', async () => {
      const res = await login({ email: 'ok@x', password: 'pw' })
      expect(res.token).toBe('fresh-token')
      expect(res.user.email).toBe('ok@x')
    })

    it('rejects on 401', async () => {
      await expect(
        login({ email: 'fail@x', password: 'wrong' })
      ).rejects.toBeDefined()
    })
  })

  describe('register', () => {
    it('returns the created user payload', async () => {
      const res = await register({ email: 'new@x', password: 'pw' })
      expect(res).toEqual({ id: 'u-new', email: 'new@x' })
    })

    it('passes name through when provided', async () => {
      let received: unknown = null
      server.use(
        http.post('/api/auth/register', async ({ request }) => {
          received = await request.json()
          return HttpResponse.json({ id: 'x', email: 'x@x' })
        })
      )
      await register({ email: 'x@x', password: 'pw', name: 'Alice' })
      expect(received).toEqual({ email: 'x@x', password: 'pw', name: 'Alice' })
    })

    it('rejects on 409', async () => {
      await expect(
        register({ email: 'taken@x', password: 'pw' })
      ).rejects.toBeDefined()
    })
  })

  describe('persistSession / readStoredUser / logoutLocal', () => {
    it('persistSession writes token and user to localStorage', () => {
      persistSession('tok', { id: 'a', email: 'a@x', name: 'A' })
      expect(localStorage.getItem('token')).toBe('tok')
      expect(JSON.parse(localStorage.getItem('user')!)).toEqual({
        id: 'a',
        email: 'a@x',
        name: 'A',
      })
    })

    it('readStoredUser returns the parsed user', () => {
      localStorage.setItem('token', 'tok')
      localStorage.setItem(
        'user',
        JSON.stringify({ id: 'a', email: 'a@x', name: 'A' })
      )
      expect(readStoredUser()).toEqual({ id: 'a', email: 'a@x', name: 'A' })
    })

    it('readStoredUser returns null when token is missing', () => {
      localStorage.setItem('user', JSON.stringify({ id: 'a', email: 'a@x' }))
      expect(readStoredUser()).toBeNull()
    })

    it('readStoredUser returns null when user is missing', () => {
      localStorage.setItem('token', 'tok')
      expect(readStoredUser()).toBeNull()
    })

    it('readStoredUser returns null when stored user is invalid JSON', () => {
      localStorage.setItem('token', 'tok')
      localStorage.setItem('user', '{not json')
      expect(readStoredUser()).toBeNull()
    })

    it('logoutLocal clears token and user from localStorage', () => {
      localStorage.setItem('token', 'tok')
      localStorage.setItem('user', '{}')
      logoutLocal()
      expect(localStorage.getItem('token')).toBeNull()
      expect(localStorage.getItem('user')).toBeNull()
    })
  })
})
