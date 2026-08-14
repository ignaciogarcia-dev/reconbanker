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

/** The use-case surface the command needs, narrowed so a test can stand in without a database. */
export type ScriptPublisher = Pick<PublishOfficialScriptUseCase, 'execute'>

// Argv and the use case are parameters rather than things `main` reaches for, so the command
// is reachable from a test without a database. Constructing them — and the pool teardown —
// belongs to the bootstrap below, which is the only part that needs a real process.
export async function main(argv: string[], useCase: ScriptPublisher): Promise<void> {
  const { bank, flowType, version } = parseArgs(argv)

  await useCase.execute({ bank, flowType, version })
  log.info(`published ${bank}:${flowType} v${version} as the new official active script`)
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const useCase = new PublishOfficialScriptUseCase(
    new BankScriptRepository(executorFromPool(db)),
    new PgUnitOfWork(db),
    new InMemoryEventBus(logger)
  )
  main(process.argv.slice(2), useCase)
    .then(() => db.end())
    .catch(err => {
      log.error('publish-script failed', { error: err instanceof Error ? err.message : String(err) })
      process.exit(1)
    })
}
