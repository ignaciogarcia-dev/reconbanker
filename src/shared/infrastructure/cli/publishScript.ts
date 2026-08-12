import 'dotenv/config'
import { db } from '../db/client.js'
import { executorFromPool } from '../../../contexts/script-engine/infrastructure/Executor.js'
import { BankScriptRepository } from '../../../contexts/script-engine/infrastructure/BankScriptRepository.js'
import { PublishOfficialScriptUseCase } from '../../../contexts/script-engine/application/PublishOfficialScriptUseCase.js'
import { PgUnitOfWork } from '../../persistence/PgUnitOfWork.js'
import { InMemoryEventBus } from '../../events/InMemoryEventBus.js'
import { logger } from '../../logger/index.js'
import type { FlowType } from '../../../contexts/script-engine/domain/BankScript.js'

const log = logger.child('[publish-script]')

const FLOW_TYPES = ['login', 'extract_transactions', 'verify_payment']

export function parseArgs(argv: string[]): { bank: string; flowType: FlowType; version: string } {
  const opts: Record<string, string> = {}
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.+)$/.exec(arg)
    if (match) opts[match[1]] = match[2]
  }
  if (!opts.bank || !opts.flowType || !opts.version) {
    throw new Error('Usage: publish-script --bank=<code> --flowType=<login|extract_transactions|verify_payment> --version=<x.y.z>')
  }
  if (!FLOW_TYPES.includes(opts.flowType)) {
    throw new Error(`Invalid flowType: ${opts.flowType} (expected one of ${FLOW_TYPES.join(', ')})`)
  }
  return { bank: opts.bank, flowType: opts.flowType as FlowType, version: opts.version }
}

async function main() {
  const { bank, flowType, version } = parseArgs(process.argv.slice(2))

  const repo = new BankScriptRepository(executorFromPool(db))
  const useCase = new PublishOfficialScriptUseCase(repo, new PgUnitOfWork(db), new InMemoryEventBus(logger))

  await useCase.execute({ bank, flowType, version })
  log.info(`published ${bank}:${flowType} v${version} as the new official active script`)
  await db.end()
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch(err => {
    log.error('publish-script failed', { error: err instanceof Error ? err.message : String(err) })
    process.exit(1)
  })
}
