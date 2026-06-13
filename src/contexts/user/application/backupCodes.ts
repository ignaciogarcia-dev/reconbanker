import { randomInt } from 'node:crypto'

// Crockford-ish alphabet without easily confused characters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 10

/** Generates a single human-friendly backup code, e.g. "ABCDE-FGHJK". */
export function generateBackupCode(): string {
  // randomInt is uniform over [0, length); `byte % 31` would be biased because
  // 256 is not a multiple of the 31-character alphabet.
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[randomInt(0, ALPHABET.length)]
  return `${out.slice(0, 5)}-${out.slice(5)}`
}

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, generateBackupCode)
}

/** Strips formatting so display ("ABCDE-FGHJK") and stored forms compare equal. */
export function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
