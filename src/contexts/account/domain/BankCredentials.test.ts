import { describe, it, expect } from 'vitest'
import { validateBankCredentialsInput } from './BankCredentials.js'
import { ValidationError } from '../../../shared/errors/index.js'

describe('validateBankCredentialsInput', () => {
  const base = { accountId: 'acc-1', username: 'u', encryptedPassword: 'p' }

  it('accepts valid input', () => {
    expect(() => validateBankCredentialsInput(base)).not.toThrow()
  })

  it('rejects missing accountId', () => {
    expect(() => validateBankCredentialsInput({ ...base, accountId: '' })).toThrow(ValidationError)
  })

  it('rejects missing or blank username', () => {
    expect(() => validateBankCredentialsInput({ ...base, username: '' })).toThrow(ValidationError)
    expect(() => validateBankCredentialsInput({ ...base, username: '   ' })).toThrow(ValidationError)
  })

  it('rejects missing encryptedPassword', () => {
    expect(() => validateBankCredentialsInput({ ...base, encryptedPassword: '' })).toThrow(ValidationError)
  })
})
