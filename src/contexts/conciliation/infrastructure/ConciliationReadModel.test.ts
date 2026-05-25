import { describe, it, expect, vi } from 'vitest'
import { ConciliationReadModel } from './ConciliationReadModel.js'

function makePool(queryResults: any[]) {
  const query = vi.fn()
  for (const r of queryResults) query.mockResolvedValueOnce(r)
  return { query } as any
}

describe('ConciliationReadModel.list branches', () => {
  it('lists with status filter and maps null-able fields to null', async () => {
    const row = {
      id: 'r-1', account_id: 'acc-1', external_id: 'ext-1',
      expected_amount: '100.00', currency: 'USD',
      sender_name: null, status: 'pending', retry_count: 0,
      last_checked_at: null, created_at: new Date(),
      bank: null, account_name: null,
    }
    const pool = makePool([{ rows: [row] }])
    const rm = new ConciliationReadModel(pool)
    const items = await rm.list({ userId: 'u-1', status: 'pending', limit: 10, offset: 0 })
    expect(items).toHaveLength(1)
    expect(items[0].senderName).toBeNull()
    expect(items[0].bank).toBeNull()
    expect(items[0].accountName).toBeNull()
    expect(items[0].lastCheckedAt).toBeNull()
    const [, params] = pool.query.mock.calls[0]
    expect(params).toEqual([10, 0, 'u-1', 'pending'])
  })

  it('lists without status filter and maps populated fields', async () => {
    const row = {
      id: 'r-2', account_id: 'acc-2', external_id: 'ext-2',
      expected_amount: '50', currency: 'USD',
      sender_name: 'Alice', status: 'pending', retry_count: 0,
      last_checked_at: new Date(), created_at: new Date(),
      bank: 'BankX', account_name: 'Main',
    }
    const pool = makePool([{ rows: [row] }])
    const rm = new ConciliationReadModel(pool)
    const items = await rm.list({ userId: 'u-1', limit: 10, offset: 0 })
    expect(items[0].senderName).toBe('Alice')
    expect(items[0].bank).toBe('BankX')
    expect(items[0].accountName).toBe('Main')
    const [, params] = pool.query.mock.calls[0]
    expect(params).toEqual([10, 0, 'u-1'])
  })
})

describe('ConciliationReadModel.findDetailForUser branches', () => {
  function detailRows({ matched, withMatch, candidatesAsString, failureType, senderInMatch }: {
    matched: boolean
    withMatch: boolean
    candidatesAsString: boolean
    failureType: string | null
    senderInMatch: string | null
  }) {
    const requestRows = matched
      ? [{
          id: 'r-1', account_id: 'acc-1', external_id: 'ext-1',
          expected_amount: '100', currency: 'USD',
          sender_name: 'Alice', status: 'pending', retry_count: 0,
          last_checked_at: null, created_at: new Date(),
          bank: 'B', account_name: 'A',
        }]
      : []
    const attemptRows = matched
      ? [{
          id: 'a-1', attempt_number: 1, status: 'success',
          failure_type: failureType,
          matched_candidates: candidatesAsString ? '["tx-1","tx-2"]' : ['tx-1', 'tx-2'],
          selected_transaction_id: 'tx-1', created_at: new Date(),
        }]
      : []
    const matchRows = withMatch
      ? [{
          id: 'm-1', bank_transaction_id: 'tx-1', amount: '100', currency: 'USD',
          sender_name: senderInMatch, received_at: new Date(),
          is_primary: true, is_notified: false, matched_at: new Date(),
        }]
      : []
    return [{ rows: requestRows }, { rows: attemptRows }, { rows: matchRows }]
  }

  it('returns null when no request row', async () => {
    const pool = makePool(detailRows({
      matched: false, withMatch: false, candidatesAsString: false,
      failureType: null, senderInMatch: null,
    }))
    const rm = new ConciliationReadModel(pool)
    expect(await rm.findDetailForUser('r-1', 'u-1')).toBeNull()
  })

  it('parses string candidates and maps null fields in attempts and match', async () => {
    const pool = makePool(detailRows({
      matched: true, withMatch: true, candidatesAsString: true,
      failureType: null, senderInMatch: null,
    }))
    const rm = new ConciliationReadModel(pool)
    const out = await rm.findDetailForUser('r-1', 'u-1')
    expect(out?.attempts[0].failureType).toBeNull()
    expect(out?.attempts[0].candidateIds).toEqual(['tx-1', 'tx-2'])
    expect(out?.match?.senderName).toBeNull()
  })

  it('handles array candidates and populated fields', async () => {
    const pool = makePool(detailRows({
      matched: true, withMatch: true, candidatesAsString: false,
      failureType: 'rule_miss', senderInMatch: 'Alice',
    }))
    const rm = new ConciliationReadModel(pool)
    const out = await rm.findDetailForUser('r-1', 'u-1')
    expect(out?.attempts[0].failureType).toBe('rule_miss')
    expect(out?.attempts[0].candidateIds).toEqual(['tx-1', 'tx-2'])
    expect(out?.match?.senderName).toBe('Alice')
  })

  it('handles missing candidates (null) and absent match row', async () => {
    const requestRows = [{
      id: 'r-1', account_id: 'acc-1', external_id: 'ext-1',
      expected_amount: '100', currency: 'USD',
      sender_name: 'Alice', status: 'pending', retry_count: 0,
      last_checked_at: null, created_at: new Date(),
      bank: 'B', account_name: 'A',
    }]
    const attemptRows = [{
      id: 'a-1', attempt_number: 1, status: 'no_match',
      failure_type: null, matched_candidates: null,
      selected_transaction_id: null, created_at: new Date(),
    }]
    const pool = makePool([{ rows: requestRows }, { rows: attemptRows }, { rows: [] }])
    const rm = new ConciliationReadModel(pool)
    const out = await rm.findDetailForUser('r-1', 'u-1')
    expect(out?.attempts[0].candidateIds).toEqual([])
    expect(out?.attempts[0].selectedTransactionId).toBeNull()
    expect(out?.match).toBeNull()
  })
})
