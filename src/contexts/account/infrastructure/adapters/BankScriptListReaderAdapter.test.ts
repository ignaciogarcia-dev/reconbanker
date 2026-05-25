import { describe, it, expect, vi } from 'vitest'
import { BankScriptListReaderAdapter } from './BankScriptListReaderAdapter.js'

describe('BankScriptListReaderAdapter', () => {
  it('queries bank_scripts and maps rows to BankScriptSummary[]', async () => {
    const rows = [
      {
        id: 'sc-1',
        flow_type: 'login',
        version: 3,
        status: 'active',
        origin: 'manual',
        created_at: new Date('2024-01-01T00:00:00Z'),
      },
      {
        id: 'sc-2',
        flow_type: 'scrape',
        version: 1,
        status: 'draft',
        origin: 'ai',
        created_at: new Date('2024-02-01T00:00:00Z'),
      },
    ]
    const pool = { query: vi.fn().mockResolvedValue({ rows }) }
    const adapter = new BankScriptListReaderAdapter(pool as any)

    const result = await adapter.listForBank('bank-1')

    expect(pool.query).toHaveBeenCalledTimes(1)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('FROM bank_scripts')
    expect(sql).toContain('WHERE bank_id = $1')
    expect(sql).toContain('ORDER BY created_at DESC')
    expect(params).toEqual(['bank-1'])
    expect(result).toEqual([
      {
        id: 'sc-1',
        flowType: 'login',
        version: 3,
        status: 'active',
        origin: 'manual',
        createdAt: rows[0].created_at,
      },
      {
        id: 'sc-2',
        flowType: 'scrape',
        version: 1,
        status: 'draft',
        origin: 'ai',
        createdAt: rows[1].created_at,
      },
    ])
  })

  it('returns empty array when no rows are returned', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const adapter = new BankScriptListReaderAdapter(pool as any)
    expect(await adapter.listForBank('bank-x')).toEqual([])
  })
})
