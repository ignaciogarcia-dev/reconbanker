import { UserRepository } from '../infrastructure/UserRepository.js'
import { OperationMode } from '../domain/User.js'
import { IUserDataCleaner } from '../domain/ports/IUserDataCleaner.js'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { NotFoundError } from '../../../shared/errors/index.js'

interface Input {
  userId: string
  mode: OperationMode
}

/**
 * Switching operation mode wipes the user's bank movements and conciliation
 * history atomically — the two modes have different compliance constraints,
 * so historical data cannot be carried across them.
 */
export class ChangeOperationModeUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly dataCleaner: IUserDataCleaner,
    private readonly eventBus: IEventBus,
  ) {}

  async execute({ userId, mode }: Input): Promise<{ mode: OperationMode }> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new NotFoundError('User not found')

    user.changeOperationMode(mode)

    await this.unitOfWork.run(async (tx) => {
      await this.dataCleaner.wipeForUser(tx, userId)
      await this.userRepo.withTx(tx).save(user)
    })

    await this.eventBus.publishAll(user.domainEvents)
    user.clearDomainEvents()

    return { mode }
  }
}
