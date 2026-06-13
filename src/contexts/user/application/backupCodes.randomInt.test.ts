import { describe, it, expect, vi } from 'vitest'

// Unbiased character selection must come from crypto.randomInt (uniform over the
// alphabet), not `byte % alphabet.length` (which is biased because 256 is not a
// multiple of 31). Controlling randomInt lets us assert the mapping directly.
const randomIntMock = vi.fn()
vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  return { ...actual, default: actual, randomInt: (...args: unknown[]) => randomIntMock(...args) }
})

const { generateBackupCode } = await import('./backupCodes.js')
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

describe('generateBackupCode unbiased selection', () => {
  it('maps each crypto.randomInt index to the alphabet (no modulo bias)', () => {
    let i = 0
    // Return indices 0..9 across the 10 characters.
    randomIntMock.mockImplementation(() => i++)
    const code = generateBackupCode()
    const expected = ALPHABET.slice(0, 10).split('').map((c) => c).join('')
    expect(code).toBe(`${expected.slice(0, 5)}-${expected.slice(5)}`)
    // randomInt called once per character with the alphabet length as bound.
    expect(randomIntMock).toHaveBeenCalledTimes(10)
    expect(randomIntMock).toHaveBeenCalledWith(0, ALPHABET.length)
  })
})
