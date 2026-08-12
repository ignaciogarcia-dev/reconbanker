import { BankScriptRepository } from '../infrastructure/BankScriptRepository.js'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { ForbiddenError, NotFoundError } from '../../../shared/errors/index.js'

interface Input { scriptId: string; callerId: string }

export class PromoteScriptUseCase {
  constructor(
    private readonly scriptRepo: BankScriptRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly eventBus: IEventBus,
  ) {}

  async execute({ scriptId, callerId }: Input): Promise<void> {
    const script = await this.scriptRepo.findById(scriptId)
    if (!script) throw new NotFoundError(`Script ${scriptId} not found`)
    if (script.userId != null && script.userId !== callerId) {
      throw new NotFoundError(`Script ${scriptId} not found`)
    }
    if (script.userId == null) {
      throw new ForbiddenError('Only the script owner can promote it')
    }

    script.promote()

    await this.unitOfWork.run(async (tx) => {
      const txRepo = this.scriptRepo.withTx(tx)
      await txRepo.deprecateActive(script.bank, script.flowType, script.accountId ?? null, script.userId ?? null)
      await txRepo.save(script)
    })

    await this.eventBus.publishAll(script.domainEvents)
    script.clearDomainEvents()
  }
}
