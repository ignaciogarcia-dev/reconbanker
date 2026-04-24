import { Router } from 'express'
import { db } from '../../shared/infrastructure/db/client.js'
import { Queues } from '../../shared/infrastructure/queues/QueueRegistry.js'

export const conciliationRouter = Router()

conciliationRouter.get('/', async (req, res) => {
  const limit = Number(req.query.limit ?? 50)
  const offset = Number(req.query.offset ?? 0)
  const status = req.query.status as string | undefined

  const conditions = status ? `WHERE status = $3` : ''
  const params = status ? [limit, offset, status] : [limit, offset]

  const { rows } = await db.query(
    `SELECT cr.*, a.bank, a.name as account_name
     FROM conciliation_requests cr
     JOIN accounts a ON a.id = cr.account_id
     ${conditions}
     ORDER BY cr.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  )
  res.json(rows)
})

conciliationRouter.get('/:requestId', async (req, res) => {
  const { rows: [request] } = await db.query(
    `SELECT cr.*, a.bank, a.name as account_name
     FROM conciliation_requests cr
     JOIN accounts a ON a.id = cr.account_id
     WHERE cr.id = $1`,
    [req.params.requestId]
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

conciliationRouter.post('/:requestId/run', async (req, res) => {
  await Queues.conciliation.add('run', { requestId: req.params.requestId })
  res.status(202).json({ queued: true })
})

conciliationRouter.post('/:requestId/notify', async (req, res) => {
  await Queues.webhook.add('notify', { requestId: req.params.requestId })
  res.status(202).json({ queued: true })
})

conciliationRouter.post('/poll/:accountId', async (req, res) => {
  await Queues.orderIngestion.add('poll', { accountId: req.params.accountId })
  res.status(202).json({ queued: true })
})
