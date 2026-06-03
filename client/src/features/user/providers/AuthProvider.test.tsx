import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { AuthProvider } from './AuthProvider'
import { useAuth } from '../hooks/useAuth'

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    server.use(...userHandlers)
  })

  it('initial state hydrates from localStorage when token + user exist', () => {
    localStorage.setItem('token', 'tok')
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'u-1', email: 'a@x', name: 'A' })
    )
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).toEqual({ id: 'u-1', email: 'a@x', name: 'A' })
  })

  it('initial state is null when no session is stored', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).toBeNull()
  })

  it('login() stores token + user and updates state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await result.current.login('ok@x', 'pw')
    })
    await waitFor(() => {
      expect(result.current.user?.email).toBe('ok@x')
    })
    expect(localStorage.getItem('token')).toBe('fresh-token')
    expect(JSON.parse(localStorage.getItem('user')!).email).toBe('ok@x')
  })

  it('login() rejects on bad credentials without changing state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await expect(
      act(async () => {
        await result.current.login('fail@x', 'wrong')
      })
    ).rejects.toBeDefined()
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('login() returns a totp_required outcome without persisting a session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    let outcome: Awaited<ReturnType<typeof result.current.login>> | undefined
    await act(async () => {
      outcome = await result.current.login('2fa@x', 'pw')
    })
    expect(outcome).toEqual({ status: 'totp_required', challengeToken: 'challenge-token' })
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('completeTotpLogin() persists the session and sets the user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await result.current.completeTotpLogin('challenge-token', '123456')
    })
    await waitFor(() => expect(result.current.user?.email).toBe('test@x'))
    expect(localStorage.getItem('token')).toBe('fresh-token')
  })

  it('completeTotpLogin() rejects an invalid code without changing state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await expect(
      act(async () => {
        await result.current.completeTotpLogin('challenge-token', '000000')
      })
    ).rejects.toBeDefined()
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('logout() clears state and localStorage', async () => {
    localStorage.setItem('token', 'tok')
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'u-1', email: 'a@x' })
    )
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => {
      result.current.logout()
    })
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })
})
