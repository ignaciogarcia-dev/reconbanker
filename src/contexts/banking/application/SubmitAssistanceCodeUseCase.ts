import { IAssistanceRequestRepository } from '../domain/IAssistanceRequestRepository.js'
import { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'
import { NotFoundError } from '../../../shared/errors/index.js'

// Only pushes the code onto the per-request stream since the coordinator alone marks fulfillment to keep one source of truth
export class SubmitAssistanceCodeUseCase {
  constructor(
    private readonly assistanceRepo: IAssistanceRequestRepository,
    private readonly bus: RealtimeBus,
  ) {}

  async execute(accountId: string, code: string): Promise<void> {
    const pending = await this.assistanceRepo.findPending(accountId)
    if (!pending) throw new NotFoundError('No pending assistance request for this account')
    await this.bus.submitOtp(pending.id, code)
  }
}
