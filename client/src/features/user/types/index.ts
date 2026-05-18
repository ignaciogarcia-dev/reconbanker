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
