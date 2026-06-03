import { createContext, useState, type ReactNode } from 'react'
import {
  login as apiLogin,
  isTotpChallenge,
  verifyTotpLogin as apiVerifyTotpLogin,
  persistSession,
  logoutLocal,
  readStoredUser,
} from '../api/auth'
import type { User } from '../types'

export type LoginOutcome =
  | { status: 'authenticated' }
  | { status: 'totp_required'; challengeToken: string }

export interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<LoginOutcome>
  completeTotpLogin: (challengeToken: string, code: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser)

  async function login(email: string, password: string): Promise<LoginOutcome> {
    const result = await apiLogin({ email, password })
    if (isTotpChallenge(result)) {
      // Do not persist anything yet — the session starts only after the TOTP step.
      return { status: 'totp_required', challengeToken: result.challengeToken }
    }
    persistSession(result.token, result.user)
    setUser(result.user)
    return { status: 'authenticated' }
  }

  async function completeTotpLogin(challengeToken: string, code: string): Promise<void> {
    const { token, user } = await apiVerifyTotpLogin(challengeToken, code)
    persistSession(token, user)
    setUser(user)
  }

  function logout() {
    logoutLocal()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, completeTotpLogin, logout, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  )
}
