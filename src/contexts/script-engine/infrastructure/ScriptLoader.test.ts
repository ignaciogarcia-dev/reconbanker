import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbQueryMock = vi.fn()
const existsSyncMock = vi.fn()
const readFileSyncMock = vi.fn()

vi.mock('../../../shared/infrastructure/db/client.js', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}))

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
  readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
}))

import { ScriptLoader } from './ScriptLoader.js'

const UUID = '11111111-2222-3333-4444-555555555555'

describe('ScriptLoader', () => {
  beforeEach(() => {
    dbQueryMock.mockReset()
    existsSyncMock.mockReset()
    readFileSyncMock.mockReset()
  })

  it('returns null when the bank code is unknown', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] })
    const result = await ScriptLoader.loadActive('UNKNOWN', 'extract_transactions')
    expect(result).toBeNull()
    expect(dbQueryMock).toHaveBeenCalledTimes(1)
    expect(dbQueryMock).toHaveBeenCalledWith(expect.stringContaining('FROM banks'), ['UNKNOWN'])
  })

  it('treats a uuid input as a direct bank id without a lookup query', async () => {
    // First query is the active-script lookup (no banks lookup expected).
    dbQueryMock.mockResolvedValueOnce({ rows: [] })
    const result = await ScriptLoader.loadActive(UUID, 'extract_transactions')
    expect(result).toBeNull()
    expect(dbQueryMock).toHaveBeenCalledTimes(1)
    expect(dbQueryMock.mock.calls[0][1]).toEqual([UUID, 'extract_transactions'])
  })

  it('returns null when the active-script lookup yields no rows', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'bank-id' }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await ScriptLoader.loadActive('bancopichincha', 'extract_transactions')
    expect(result).toBeNull()
  })

  it('reconstitutes a BankScript with the on-disk codeSnapshot when an active row is found', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'bank-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'script-id',
          bank_code: 'BancoPichincha',
          flow_type: 'extract_transactions',
          version: '1.0.0',
          status: 'active',
          origin: 'system',
          base_script_id: null,
          selector_map: {},
          created_at: new Date('2026-01-01T00:00:00Z'),
        }],
      })
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce('// script body')

    const result = await ScriptLoader.loadActive('BancoPichincha', 'extract_transactions')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('script-id')
    expect(result!.codeSnapshot).toBe('// script body')
    expect(result!.bank).toBe('BancoPichincha')
    expect(result!.flowType).toBe('extract_transactions')
    expect(result!.version).toBe('1.0.0')

    // Verifies the bank slug lowercasing + whitespace strip in the file path.
    const filePath = existsSyncMock.mock.calls[0][0] as string
    expect(filePath).toMatch(/bancopichincha\/extract_transactions\.v1\.0\.0\.js$/)
  })

  it('throws when the script file does not exist on disk', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'bank-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'script-id',
          bank_code: 'GhostBank',
          flow_type: 'extract_transactions',
          version: '9.9.9',
          status: 'active',
          origin: 'system',
          base_script_id: null,
          selector_map: {},
          created_at: new Date(),
        }],
      })
    existsSyncMock.mockReturnValueOnce(false)

    await expect(
      ScriptLoader.loadActive('GhostBank', 'extract_transactions'),
    ).rejects.toThrow(/Script file not found/i)
  })

  it('rejects a bank slug containing path-traversal characters before touching the filesystem', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'bank-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'script-id',
          bank_code: '../../../etc/passwd',
          flow_type: 'extract_transactions',
          version: '1.0.0',
          status: 'active',
          origin: 'system',
          base_script_id: null,
          selector_map: {},
          created_at: new Date(),
        }],
      })

    await expect(
      ScriptLoader.loadActive('whatever', 'extract_transactions'),
    ).rejects.toThrow(/invalid bank/i)
    expect(existsSyncMock).not.toHaveBeenCalled()
  })

  it('slugifies bank names with internal whitespace before resolving the file path', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'bank-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'script-id',
          bank_code: 'Mi Dinero',
          flow_type: 'extract_transactions',
          version: '2.0.0',
          status: 'active',
          origin: 'system',
          base_script_id: null,
          selector_map: {},
          created_at: new Date(),
        }],
      })
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce('code')

    await ScriptLoader.loadActive('Mi Dinero', 'extract_transactions')
    const filePath = existsSyncMock.mock.calls[0][0] as string
    expect(filePath).toMatch(/midinero\/extract_transactions\.v2\.0\.0\.js$/)
  })
})
