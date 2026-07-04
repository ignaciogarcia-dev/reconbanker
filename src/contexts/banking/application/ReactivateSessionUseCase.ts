import { IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js'

export interface ReactivateResult {
  started: boolean
}

// Manually (re)launches an assisted persistent session parked in needs_attention.
// Starts it directly (fire-and-forget) rather than via the scrape queue to cut latency;
// ensureRunning is idempotent so a repeat/already-running reactivate is a safe no-op.
export class ReactivateSessionUseCase {
  constructor(
    private readonly accountReader: IAccountForBankingReader,
    private readonly start: (accountId: string) => void,
  ) {}

  async execute(accountId: string): Promise<ReactivateResult> {
    const account = await this.accountReader.findById(accountId)
    if (!account) throw new NotFoundError('Account not found')
    if (account.sessionType !== 'persistent' || account.loginMode !== 'assisted') {
      throw new ValidationError('Reactivation is only available for assisted persistent sessions')
    }
    this.start(accountId)
    return { started: true }
  }
}
