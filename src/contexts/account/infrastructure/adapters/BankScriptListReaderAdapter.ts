import type pg from 'pg'
import {
  IBankScriptListReader,
  BankScriptSummary,
} from '../../domain/ports/IBankScriptListReader.js'

export class BankScriptListReaderAdapter implements IBankScriptListReader {
  constructor(private readonly pool: pg.Pool) {}

  async listForBank(bankId: string): Promise<BankScriptSummary[]> {
    const { rows } = await this.pool.query(
      `SELECT id, flow_type, version, status, origin, created_at
         FROM bank_scripts
        WHERE bank_id = $1
        ORDER BY created_at DESC`,
      [bankId]
    )
    return rows.map((r: any) => ({
      id: r.id,
      flowType: r.flow_type,
      version: r.version,
      status: r.status,
      origin: r.origin,
      createdAt: r.created_at,
    }))
  }
}
