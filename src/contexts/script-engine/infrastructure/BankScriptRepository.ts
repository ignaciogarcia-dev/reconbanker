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

  async findAll(): Promise<ScriptListItem[]> {
    const { rows } = await this.executor.query<BankScriptRow>(
      `SELECT * FROM bank_scripts ORDER BY bank, flow_type, created_at DESC`
    )
    return rows.map((r) => ({
      id: r.id,
      bank: r.bank,
      flowType: r.flow_type,
      version: r.version,
      status: r.status,
      origin: r.origin,
      createdAt: r.created_at,
    }))
  }

  async deprecateActive(bank: string, flowType: FlowType): Promise<void> {
    await this.executor.query(
      `UPDATE bank_scripts SET status='deprecated' WHERE bank=$1 AND flow_type=$2 AND status='active'`,
      [bank, flowType]
    )
  }

  async save(script: BankScript): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_scripts
         (id, bank, flow_type, version, status, origin, base_script_id, code_snapshot, selector_map, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
        script.createdAt,
      ]
    )
  }
}
