import { BankScriptRepository } from '../infrastructure/BankScriptRepository.js'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { NotFoundError } from '../../../shared/errors/index.js'

interface Input { scriptId: string }

export class PromoteScriptUseCase {
  constructor(
    private readonly scriptRepo: BankScriptRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly eventBus: IEventBus,
  ) {}

  async execute({ scriptId }: Input): Promise<void> {
    const script = await this.scriptRepo.findById(scriptId)
    if (!script) throw new NotFoundError(`Script ${scriptId} not found`)

    script.promote()

    await this.unitOfWork.run(async (tx) => {
      const txRepo = this.scriptRepo.withTx(tx)
      await txRepo.deprecateActive(script.bank, script.flowType)
      await txRepo.save(script)
    })

    await this.eventBus.publishAll(script.domainEvents)
    script.clearDomainEvents()
  }
}
