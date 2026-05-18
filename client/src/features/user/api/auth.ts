import { httpClient } from '@/shared/http/client'
import type { LoginInput, LoginResponse, RegisterInput, User } from '../types'

export async function login(input: LoginInput): Promise<LoginResponse> {
  const { data } = await httpClient.post<LoginResponse>('/auth/login', input)
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
