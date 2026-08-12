import crypto from 'crypto'
import { BankScript, FlowType } from '../domain/BankScript.js'
import { BankScriptRepository } from '../infrastructure/BankScriptRepository.js'
import { ScriptLoader } from '../infrastructure/ScriptLoader.js'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { NotFoundError } from '../../../shared/errors/index.js'

interface Input { bank: string; flowType: FlowType; version: string }

/**
 * CLI-only: registers a new git-committed script version as the official one
 * for a bank/flow. No callerId/role check — trust comes from having shell/DB
 * access to run this at all, the same trust level as hand-writing a migration.
 */
export class PublishOfficialScriptUseCase {
  constructor(
    private readonly scriptRepo: BankScriptRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly eventBus: IEventBus,
  ) {}

  async execute({ bank, flowType, version }: Input): Promise<void> {
    if (!ScriptLoader.scriptFileExists(bank, flowType, version)) {
      throw new NotFoundError(`Script file not found for ${bank}:${flowType}:v${version}`)
    }

    const script = BankScript.create(crypto.randomUUID(), {
      bank, flowType, version, status: 'review', origin: 'system', selectorMap: {},
    })
    script.promote()

    await this.unitOfWork.run(async (tx) => {
      const txRepo = this.scriptRepo.withTx(tx)
      await txRepo.deprecateActive(bank, flowType, null, null)
      await txRepo.save(script)
    })

    await this.eventBus.publishAll(script.domainEvents)
    script.clearDomainEvents()
  }
}
