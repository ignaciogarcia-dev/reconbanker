import { IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { NotFoundError } from '../../../shared/errors/index.js'

export interface KillResult {
  killed: boolean
}

// Force-terminates a live persistent session (hung or otherwise). Validates the account exists
// (mirrors ReactivateSessionUseCase); unlike reactivate there is no session-type restriction, since a
// one-shot account simply has no live session. Idempotent on the session: no live session found →
// { killed: false }, not an error.
export class KillSessionUseCase {
  constructor(
    private readonly accountReader: IAccountForBankingReader,
    private readonly kill: (accountId: string) => boolean,
  ) {}

  async execute(accountId: string): Promise<KillResult> {
    const account = await this.accountReader.findById(accountId)
    if (!account) throw new NotFoundError('Account not found')
    return { killed: this.kill(accountId) }
  }
}
