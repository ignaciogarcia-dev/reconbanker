import { db } from '../../../shared/infrastructure/db/client.js'
import { Queues } from '../../../shared/infrastructure/queues/QueueRegistry.js'
import { ConciliationRequestRepository } from '../infrastructure/ConciliationRequestRepository.js'
import { AccountConfigRepository } from '../../account/infrastructure/AccountConfigRepository.js'
import crypto from 'crypto'

interface JobData { accountId: string }

export class PollPendingOrdersUseCase {
  private readonly requestRepo = new ConciliationRequestRepository()
  private readonly configRepo = new AccountConfigRepository()

  async execute({ accountId }: JobData): Promise<void> {
    const config = await this.configRepo.findByAccountId(accountId)
    if (!config) throw new Error(`No config for account ${accountId}`)

    if (config.mode === 'passthrough') return
    if (!config.pendingOrdersEndpoint) return

    // Build auth header
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.authToken) {
      if (config.authType === 'api_key') headers['Authorization'] = `Api-Key ${config.authToken}`
      else headers['Authorization'] = `Bearer ${config.authToken}`
    }

    // Fetch orders
    const isPost = config.pollingMethod === 'POST'
    const response = await fetch(config.pendingOrdersEndpoint, {
      method: config.pollingMethod,
      headers,
      body: isPost ? JSON.stringify(config.pollingBody ?? {}) : undefined,
    })

    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok) {
      const bodySnippet = await response.text().catch(() => '')
      throw new Error(
        `Polling failed: ${response.status} ${response.statusText} (content-type: ${contentType})` +
        (bodySnippet ? ` body: ${bodySnippet.slice(0, 300)}` : '')
      )
    }

    if (!contentType.toLowerCase().includes('application/json')) {
      const bodySnippet = await response.text().catch(() => '')
      throw new Error(
        `Polling returned non-JSON response (content-type: ${contentType})` +
        (bodySnippet ? ` body: ${bodySnippet.slice(0, 300)}` : '')
      )
    }

    const raw: any = await response.json()
    const orders: any = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : null
    if (!orders) {
      throw new Error(`Polling response must be a JSON array of orders (got: ${JSON.stringify(raw).slice(0, 200)})`)
    }

    const seenExternalIds: string[] = []

    for (const order of orders) {
      if (!order.external_id || order.amount == null || !order.currency || !order.sender_name) {
        console.warn(`[PollPendingOrders] Skipping order missing required fields (external_id, amount, currency, sender_name):`, order)
        continue
      }

      const externalId = String(order.external_id)
      seenExternalIds.push(externalId)

      const exists = await db.query(
        'SELECT 1 FROM conciliation_requests WHERE account_id = $1 AND external_id = $2',
        [accountId, externalId]
      )
      if (exists.rows.length > 0) continue

      const requestId = crypto.randomUUID()
      await db.query(
        `INSERT INTO conciliation_requests
           (id, account_id, external_id, expected_amount, currency, sender_name, status, retry_count, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',0,now())`,
        [
          requestId, accountId, externalId,
          order.amount, order.currency, order.sender_name ?? null,
        ]
      )

      // Encolar conciliación inmediatamente — las transacciones pueden ya estar en la DB
      await Queues.conciliation.add(
        'run',
        { requestId },
        { jobId: `conciliation_${requestId}`, removeOnComplete: true }
      )
    }

    const cancelledCount = await this.requestRepo.cancelMissing(accountId, seenExternalIds)
    if (cancelledCount > 0) {
      console.log(`[PollPendingOrders] Cancelled ${cancelledCount} order(s) missing from source for account ${accountId}`)
    }
  }
}
