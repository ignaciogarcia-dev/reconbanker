import { createContext, useState, type ReactNode } from 'react'
import { login as apiLogin, persistSession, logoutLocal, readStoredUser } from '../api/auth'
import type { User } from '../types'

export interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser)

  async function login(email: string, password: string) {
    const { token, user } = await apiLogin({ email, password })
    persistSession(token, user)
    setUser(user)
  }

  function logout() {
    logoutLocal()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  )
}
