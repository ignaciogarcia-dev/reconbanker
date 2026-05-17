import crypto from 'crypto'
import { getTestPool } from '../helpers/testDb.js'

export interface SeededConciliationRequest {
  id: string
  accountId: string
  externalId: string
  expectedAmount: number
  currency: string
  senderName: string | null
  status: string
  createdAt: Date
}

export async function insertConciliationRequest(opts: {
  accountId: string
  externalId?: string
  expectedAmount?: number
  currency?: string
  senderName?: string | null
  status?: string
  createdAt?: Date
}): Promise<SeededConciliationRequest> {
  const id = crypto.randomUUID()
  const externalId = opts.externalId ?? `ext-${crypto.randomBytes(4).toString('hex')}`
  const expectedAmount = opts.expectedAmount ?? 100
  const currency = opts.currency ?? 'USD'
  const senderName = opts.senderName === undefined ? 'Alice' : opts.senderName
  const status = opts.status ?? 'pending'
  const createdAt = opts.createdAt ?? new Date()

  await getTestPool().query(
    `INSERT INTO conciliation_requests
       (id, account_id, external_id, expected_amount, currency, sender_name, status, retry_count, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)`,
    [id, opts.accountId, externalId, expectedAmount, currency, senderName, status, createdAt]
  )
  return { id, accountId: opts.accountId, externalId, expectedAmount, currency, senderName, status, createdAt }
}

export async function insertBankTransaction(opts: {
  accountId: string
  externalId?: string
  amount?: number
  currency?: string
  senderName?: string | null
  receivedAt?: Date
  excluded?: boolean
}): Promise<{ id: string; externalId: string }> {
  const id = crypto.randomUUID()
  const externalId = opts.externalId ?? `btx-${crypto.randomBytes(4).toString('hex')}`
  const amount = opts.amount ?? 100
  const currency = opts.currency ?? 'USD'
  const senderName = opts.senderName === undefined ? 'Alice' : opts.senderName
  const receivedAt = opts.receivedAt ?? new Date()

  await getTestPool().query(
    `INSERT INTO bank_transactions
       (id, account_id, external_id, reference_hash, amount, currency, sender_name, received_at, ingested_at, raw_payload, excluded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),'{}',$9)`,
    [id, opts.accountId, externalId, `hash-${externalId}`, amount, currency, senderName, receivedAt, opts.excluded ? new Date() : null]
  )
  return { id, externalId }
}

export async function insertAccountConfig(accountId: string, opts: { notifyOnExpired?: boolean } = {}): Promise<void> {
  await getTestPool().query(
    `INSERT INTO account_config
       (account_id, pending_orders_endpoint, webhook_url, notify_on_expired)
     VALUES ($1, 'http://example.com/pending', 'http://example.com/wh', $2)`,
    [accountId, opts.notifyOnExpired ?? false]
  )
}
