import { describe, it, expect } from 'vitest'
import { generateBackupCode, generateBackupCodes, normalizeBackupCode } from './backupCodes.js'

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_RE = new RegExp(`^[${ALPHABET}]{5}-[${ALPHABET}]{5}$`)

describe('generateBackupCode', () => {
  it('produces the XXXXX-XXXXX format using the safe alphabet', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateBackupCode()).toMatch(CODE_RE)
    }
  })

  it('never includes ambiguous characters (0 O 1 I L)', () => {
    const joined = generateBackupCodes(50).join('').replace(/-/g, '')
    expect(joined).not.toMatch(/[01ILO]/)
  })

  it('produces different codes across calls', () => {
    const codes = Array.from({ length: 50 }, generateBackupCode)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('generateBackupCodes', () => {
  it('returns 10 codes by default', () => {
    expect(generateBackupCodes()).toHaveLength(10)
  })

  it('respects an explicit count', () => {
    expect(generateBackupCodes(3)).toHaveLength(3)
    expect(generateBackupCodes(0)).toHaveLength(0)
  })
})

describe('normalizeBackupCode', () => {
  it('uppercases and strips formatting so display and stored forms compare equal', () => {
    expect(normalizeBackupCode('abcde-fghjk')).toBe('ABCDEFGHJK')
    expect(normalizeBackupCode('ABCDE FGHJK')).toBe('ABCDEFGHJK')
    expect(normalizeBackupCode('  AbCdE-fGhJk  ')).toBe('ABCDEFGHJK')
  })

  it('keeps digits and drops every other non-alphanumeric character', () => {
    expect(normalizeBackupCode('a1b2-c3d4')).toBe('A1B2C3D4')
    expect(normalizeBackupCode('a.b/c@d')).toBe('ABCD')
  })

  it('maps an empty / punctuation-only string to empty', () => {
    expect(normalizeBackupCode('')).toBe('')
    expect(normalizeBackupCode('  -- ')).toBe('')
  })
})
