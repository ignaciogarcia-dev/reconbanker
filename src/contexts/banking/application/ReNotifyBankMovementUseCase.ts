import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { NotFoundError } from '../../../shared/errors/index.js'

export interface ReNotifyBankMovementDeps {
  bankTxRepo: IBankTransactionRepository
  enqueueNotify: (bankTransactionId: string) => Promise<void>
}

/**
 * Releases a prior notification claim and re-enqueues the webhook job
 * so the next attempt can re-acquire the claim and send.
 */
export class ReNotifyBankMovementUseCase {
  constructor(private readonly deps: ReNotifyBankMovementDeps) {}

  async execute(bankTransactionId: string): Promise<void> {
    const { bankTxRepo, enqueueNotify } = this.deps
    const tx = await bankTxRepo.findById(bankTransactionId)
    if (!tx) throw new NotFoundError(`Bank movement ${bankTransactionId} not found`)
    await bankTxRepo.releaseNotification(bankTransactionId)
    await enqueueNotify(bankTransactionId)
  }
}
