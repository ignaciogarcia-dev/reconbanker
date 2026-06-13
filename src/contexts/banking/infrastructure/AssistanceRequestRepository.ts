import { AssistanceRequest, OtpDescriptor } from '../domain/AssistanceRequest.js'
import { IAssistanceRequestRepository } from '../domain/IAssistanceRequestRepository.js'
import { Executor } from './Executor.js'

interface AssistanceRow {
  id: string
  account_id: string
  session_id: string | null
  type: 'otp'
  status: AssistanceRequest['status']
  descriptor: OtpDescriptor
  attempts: number
  created_at: Date
  updated_at: Date
  fulfilled_at: Date | null
}

function toDto(row: AssistanceRow): AssistanceRequest {
  return {
    id: row.id,
    accountId: row.account_id,
    sessionId: row.session_id,
    type: row.type,
    status: row.status,
    descriptor: row.descriptor,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fulfilledAt: row.fulfilled_at,
  }
}

export class AssistanceRequestRepository implements IAssistanceRequestRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): AssistanceRequestRepository {
    return new AssistanceRequestRepository(tx)
  }

  // The partial unique index uq_assistance_pending_account makes this upsert re-open the pending row instead of duplicating on a resend
  async open(accountId: string, descriptor: OtpDescriptor, sessionId: string | null = null): Promise<AssistanceRequest> {
    const { rows } = await this.executor.query<AssistanceRow>(
      `INSERT INTO assistance_requests (account_id, session_id, type, status, descriptor, attempts)
       VALUES ($1, $2, 'otp', 'pending', $3::jsonb, 1)
       ON CONFLICT (account_id) WHERE status = 'pending'
       DO UPDATE SET attempts = assistance_requests.attempts + 1,
                     descriptor = $3::jsonb,
                     session_id = COALESCE($2, assistance_requests.session_id),
                     updated_at = now()
       RETURNING *`,
      [accountId, sessionId, JSON.stringify(descriptor)]
    )
    return toDto(rows[0])
  }

  async findPending(accountId: string): Promise<AssistanceRequest | null> {
    const { rows } = await this.executor.query<AssistanceRow>(
      `SELECT * FROM assistance_requests WHERE account_id = $1 AND status = 'pending' LIMIT 1`,
      [accountId]
    )
    return rows[0] ? toDto(rows[0]) : null
  }

  async markFulfilled(id: string): Promise<void> {
    await this.executor.query(
      `UPDATE assistance_requests
       SET status = 'fulfilled', fulfilled_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [id]
    )
  }

  async close(id: string, status: 'cancelled' | 'expired'): Promise<void> {
    await this.executor.query(
      `UPDATE assistance_requests
       SET status = $2, updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [id, status]
    )
  }
}
