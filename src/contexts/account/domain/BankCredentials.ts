import { ValidationError } from '../../../shared/errors/index.js'

export type BankCredentialsStatus = 'valid' | 'invalid'

export interface BankCredentialsInput {
  accountId: string
  username: string
  encryptedPassword: string
}

export interface BankCredentialsRecord {
  accountId: string
  username: string
  status: BankCredentialsStatus
  lastValidatedAt: Date | null
}

export function validateBankCredentialsInput(input: BankCredentialsInput): void {
  if (!input.accountId) throw new ValidationError('accountId is required')
  if (!input.username || !input.username.trim()) {
    throw new ValidationError('username is required')
  }
  if (!input.encryptedPassword) {
    throw new ValidationError('encryptedPassword is required')
  }
}
