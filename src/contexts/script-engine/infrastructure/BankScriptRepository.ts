import { BankScript, FlowType } from '../domain/BankScript.js'
import { IBankScriptRepository, ScriptListItem } from '../domain/IBankScriptRepository.js'
import { Executor } from './Executor.js'
import { BankScriptRowMapper, BankScriptRow } from './mappers/BankScriptRowMapper.js'

export class BankScriptRepository implements IBankScriptRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): BankScriptRepository {
    return new BankScriptRepository(tx)
  }

  async findActive(bank: string, flowType: FlowType): Promise<BankScript | null> {
    const { rows } = await this.executor.query<BankScriptRow>(
      `SELECT * FROM bank_scripts WHERE bank=$1 AND flow_type=$2 AND status='active' LIMIT 1`,
      [bank, flowType]
    )
    return rows[0] ? BankScriptRowMapper.toAggregate(rows[0]) : null
  }

  async findById(id: string): Promise<BankScript | null> {
    const { rows } = await this.executor.query<BankScriptRow>(
      `SELECT * FROM bank_scripts WHERE id=$1`,
      [id]
    )
    return rows[0] ? BankScriptRowMapper.toAggregate(rows[0]) : null
  }

  async findAll(callerId: string): Promise<ScriptListItem[]> {
    const { rows } = await this.executor.query<BankScriptRow>(
      `SELECT * FROM bank_scripts WHERE user_id = $1 OR user_id IS NULL ORDER BY bank, flow_type, created_at DESC`,
      [callerId]
    )
    return rows.map((r) => ({
      id: r.id,
      bank: r.bank,
      flowType: r.flow_type,
      version: r.version,
      status: r.status,
      origin: r.origin,
      userId: r.user_id,
      createdAt: r.created_at,
    }))
  }

  async deprecateActive(bank: string, flowType: FlowType, accountId: string | null, userId: string | null): Promise<void> {
    await this.executor.query(
      `UPDATE bank_scripts SET status='deprecated'
       WHERE bank=$1 AND flow_type=$2 AND status='active'
         AND account_id IS NOT DISTINCT FROM $3 AND user_id IS NOT DISTINCT FROM $4`,
      [bank, flowType, accountId, userId]
    )
  }

  async save(script: BankScript): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_scripts
         (id, bank, bank_id, flow_type, version, status, origin, base_script_id, code_snapshot, selector_map, user_id, account_id, created_at)
       VALUES ($1,$2,(SELECT id FROM banks WHERE code = $2),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         code_snapshot = EXCLUDED.code_snapshot`,
      [
        script.id,
        script.bank,
        script.flowType,
        script.version,
        script.status,
        script.origin,
        script.baseScriptId ?? null,
        script.codeSnapshot ?? null,
        JSON.stringify(script.selectorMap),
        script.userId ?? null,
        script.accountId ?? null,
        script.createdAt,
      ]
    )
  }
}
