import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { db } from '../../../shared/infrastructure/db/client.js'
import { BankScript, FlowType } from '../domain/BankScript.js'

const scriptsDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'scripts')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BANK_SLUG_RE = /^[a-z0-9-]+$/

function loadScriptCode(bank: string, flowType: string, version: string): string {
  const bankSlug = bank.toLowerCase().replace(/\s+/g, '')
  // The slug is interpolated into a filesystem path; reject anything that could
  // traverse out of scriptsDir (e.g. "../") before touching disk.
  if (!BANK_SLUG_RE.test(bankSlug)) {
    throw new Error(`invalid bank slug: ${bank}`)
  }
  const filePath = path.join(scriptsDir, bankSlug, `${flowType}.v${version}.js`)
  if (!existsSync(filePath)) {
    throw new Error(`Script file not found: ${filePath}`)
  }
  return readFileSync(filePath, 'utf-8')
}

async function resolveBankId(bankIdOrCode: string): Promise<string | null> {
  if (UUID_RE.test(bankIdOrCode)) return bankIdOrCode
  const { rows } = await db.query('SELECT id FROM banks WHERE code = $1', [bankIdOrCode])
  return rows[0]?.id ?? null
}

export const ScriptLoader = {
  async loadActive(bankIdOrCode: string, flowType: FlowType): Promise<BankScript | null> {
    const bankId = await resolveBankId(bankIdOrCode)
    if (!bankId) return null

    const { rows } = await db.query(
      `SELECT bs.*, b.code AS bank_code
         FROM bank_scripts bs
         JOIN banks b ON b.id = bs.bank_id
        WHERE bs.bank_id = $1 AND bs.flow_type = $2 AND bs.status = 'active'
        LIMIT 1`,
      [bankId, flowType]
    )
    if (!rows[0]) return null

    const codeSnapshot = loadScriptCode(rows[0].bank_code, rows[0].flow_type, rows[0].version)

    return BankScript.reconstitute(rows[0].id, {
      bank: rows[0].bank_code,
      flowType: rows[0].flow_type,
      version: rows[0].version,
      status: rows[0].status,
      origin: rows[0].origin,
      baseScriptId: rows[0].base_script_id,
      codeSnapshot,
      selectorMap: rows[0].selector_map,
      createdAt: rows[0].created_at,
    })
  }
}
