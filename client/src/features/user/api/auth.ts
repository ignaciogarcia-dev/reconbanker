import { httpClient } from '@/shared/http/client'
import type { LoginInput, LoginResponse, LoginResult, RegisterInput, TotpChallenge, User } from '../types'

export async function login(input: LoginInput): Promise<LoginResult> {
  const { data } = await httpClient.post<LoginResult>('/auth/login', input)
  return data
}

/** Narrows a login result to the 2FA-challenge branch. */
export function isTotpChallenge(result: LoginResult): result is TotpChallenge {
  return 'requiresTotp' in result
}

/** Second login step: exchange the challenge token + code for a session token. */
export async function verifyTotpLogin(challengeToken: string, code: string): Promise<LoginResponse> {
  const { data } = await httpClient.post<LoginResponse>('/auth/login/totp', { challengeToken, code })
  return data
}

export async function register(input: RegisterInput): Promise<{ id: string; email: string }> {
  const { data } = await httpClient.post<{ id: string; email: string }>('/auth/register', input)
  return data
}

export function logoutLocal(): void {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export function readStoredUser(): User | null {
  const token = localStorage.getItem('token')
  const saved = localStorage.getItem('user')
  if (!token || !saved) return null
  try {
    return JSON.parse(saved) as User
  } catch {
    return null
  }
}

export function persistSession(token: string, user: User): void {
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
}
