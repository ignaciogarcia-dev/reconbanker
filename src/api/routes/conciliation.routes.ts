import { Router, Response } from 'express'
import { db } from '../../shared/infrastructure/db/client.js'
import { Queues } from '../../shared/infrastructure/queues/QueueRegistry.js'
import { AuthRequest } from '../middlewares/auth.middleware.js'

export const conciliationRouter = Router()

/** Returns the authenticated userId, or writes a 401 and returns null. */
function requireUser(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return req.userId
}

async function ownsRequest(requestId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM conciliation_requests cr
       JOIN accounts a ON a.id = cr.account_id
      WHERE cr.id = $1 AND a.user_id = $2`,
    [requestId, userId]
  )
  return rows.length > 0
}

async function ownsAccount(accountId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2`,
    [accountId, userId]
  )
  return rows.length > 0
}

conciliationRouter.get('/', async (req: AuthRequest, res) => {
  const userId = requireUser(req, res)
  if (!userId) return
  const limit = Number(req.query.limit ?? 50)
  const offset = Number(req.query.offset ?? 0)
  const status = req.query.status as string | undefined

  const conditions = status ? `AND cr.status = $4` : ''
  const params = status ? [limit, offset, userId, status] : [limit, offset, userId]

  const { rows } = await db.query(
    `SELECT cr.*, a.bank, a.name as account_name
     FROM conciliation_requests cr
     JOIN accounts a ON a.id = cr.account_id
     WHERE a.user_id = $3
     ${conditions}
     ORDER BY cr.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  )
  res.json(rows)
})

conciliationRouter.get('/:requestId', async (req: AuthRequest, res) => {
  const userId = requireUser(req, res)
  if (!userId) return
  const { rows: [request] } = await db.query(
    `SELECT cr.*, a.bank, a.name as account_name
     FROM conciliation_requests cr
     JOIN accounts a ON a.id = cr.account_id
     WHERE cr.id = $1 AND a.user_id = $2`,
    [req.params.requestId, userId]
  )
  if (!request) { res.status(404).json({ error: 'Not found' }); return }

  const { rows: attempts } = await db.query(
    `SELECT * FROM conciliation_attempts WHERE request_id = $1 ORDER BY attempt_number ASC`,
    [req.params.requestId]
  )

  const { rows: [match] } = await db.query(
    `SELECT ct.*, bt.amount, bt.currency, bt.sender_name, bt.received_at
     FROM conciliated_transactions ct
     JOIN bank_transactions bt ON bt.id = ct.bank_transaction_id
     WHERE ct.request_id = $1 AND ct.is_primary = true`,
    [req.params.requestId]
  )

  res.json({ ...request, attempts, match: match ?? null })
})

conciliationRouter.post('/:requestId/run', async (req: AuthRequest, res) => {
  const userId = requireUser(req, res)
  if (!userId) return
  const requestId = String(req.params.requestId)
  if (!(await ownsRequest(requestId, userId))) {
    res.status(404).json({ error: 'Not found' }); return
  }
  await Queues.conciliation.add('run', { requestId })
  res.status(202).json({ queued: true })
})

conciliationRouter.post('/:requestId/notify', async (req: AuthRequest, res) => {
  const userId = requireUser(req, res)
  if (!userId) return
  const requestId = String(req.params.requestId)
  if (!(await ownsRequest(requestId, userId))) {
    res.status(404).json({ error: 'Not found' }); return
  }
  await Queues.webhook.add('notify', { requestId })
  res.status(202).json({ queued: true })
})

conciliationRouter.post('/poll/:accountId', async (req: AuthRequest, res) => {
  const userId = requireUser(req, res)
  if (!userId) return
  const accountId = String(req.params.accountId)
  if (!(await ownsAccount(accountId, userId))) {
    res.status(404).json({ error: 'Account not found' }); return
  }
  await Queues.orderIngestion.add('poll', { accountId })
  res.status(202).json({ queued: true })
})
