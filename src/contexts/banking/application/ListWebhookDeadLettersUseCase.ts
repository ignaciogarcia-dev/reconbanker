import type {
  IWebhookDeadLetterStore,
  WebhookDeadLetterRecord,
} from '../../../shared/infrastructure/webhooks/IWebhookDeadLetterStore.js'

export interface ListWebhookDeadLettersDeps {
  deadLetters: IWebhookDeadLetterStore
}

/**
 * Lists the bank-movement webhook deliveries that exhausted all retries and
 * have not yet been re-driven successfully — the operator's view of which
 * movements were lost and need a manual re-send.
 */
export class ListWebhookDeadLettersUseCase {
  constructor(private readonly deps: ListWebhookDeadLettersDeps) {}

  async execute(accountId: string): Promise<WebhookDeadLetterRecord[]> {
    const unresolved = await this.deps.deadLetters.listUnresolved(accountId)
    return unresolved.filter((d) => d.subjectType === 'bank_transaction')
  }
}
