export type OperationMode = 'reconcile' | 'passthrough'

export interface User {
  id: string
  email: string
  name?: string
}

export interface Me {
  id: string
  email: string
  name: string | null
  operationMode: OperationMode | null
  totpEnabled: boolean
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  name?: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface TotpChallenge {
  requiresTotp: true
  challengeToken: string
}

/** A login attempt either succeeds outright or returns a 2FA challenge. */
export type LoginResult = LoginResponse | TotpChallenge
