import { describe, it, expect, vi } from 'vitest'

vi.mock('dotenv/config', () => ({}))
vi.mock('../db/client.js', () => ({ db: { query: vi.fn(), end: vi.fn() } }))

import { parseArgs, main } from './publishScript.js'

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

describe('the publish-script command', () => {
  const argv = ['--bank=mi-dinero', '--flowType=login', '--version=1.2.0']

  it('publishes exactly the script the args named', async () => {
    const execute = vi.fn(async () => {})

    await main(argv, { execute })

    expect(execute).toHaveBeenCalledWith({ bank: 'mi-dinero', flowType: 'login', version: '1.2.0' })
  })

  it('rejects before publishing anything when the args are unusable', async () => {
    const execute = vi.fn(async () => {})

    await expect(main(['--bank=mi-dinero'], { execute })).rejects.toThrow(/Usage:/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('propagates a publish failure rather than reporting success', async () => {
    // Propagating rather than swallowing: the bootstrap turns this into exit code 1.
    const execute = vi.fn(async () => { throw new Error('version already published') })

    await expect(main(argv, { execute })).rejects.toThrow(/version already published/)
  })
})
