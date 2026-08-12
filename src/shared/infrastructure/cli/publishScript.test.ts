import { describe, it, expect, vi } from 'vitest'

vi.mock('dotenv/config', () => ({}))
vi.mock('../db/client.js', () => ({ db: { query: vi.fn(), end: vi.fn() } }))

import { parseArgs } from './publishScript.js'

describe('publishScript parseArgs', () => {
  it('parses bank, flowType, and version from --key=value args', () => {
    const result = parseArgs(['--bank=mi-dinero', '--flowType=extract_transactions', '--version=1.1.0'])
    expect(result).toEqual({ bank: 'mi-dinero', flowType: 'extract_transactions', version: '1.1.0' })
  })

  it('throws when a required arg is missing', () => {
    expect(() => parseArgs(['--bank=mi-dinero', '--version=1.1.0'])).toThrow(/Usage:/)
  })

  it('throws when flowType is not a recognized value', () => {
    expect(() => parseArgs(['--bank=mi-dinero', '--flowType=bogus', '--version=1.1.0'])).toThrow(/Invalid flowType/)
  })
})
