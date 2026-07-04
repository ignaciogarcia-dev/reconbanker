import { describe, it, expect, vi } from 'vitest'
import { ListWebhookDeadLettersUseCase } from './ListWebhookDeadLettersUseCase.js'
import type {
  IWebhookDeadLetterStore,
  WebhookDeadLetterRecord,
} from '../../../shared/infrastructure/webhooks/IWebhookDeadLetterStore.js'

function record(overrides: Partial<WebhookDeadLetterRecord> = {}): WebhookDeadLetterRecord {
  return {
    id: 'dl-1',
    accountId: 'acc-1',
    subjectType: 'bank_transaction',
    subjectId: 'tx-1',
    url: 'https://hook.example.com',
    lastStatus: 500,
    lastError: 'boom',
    attempts: 5,
    failedAt: new Date('2026-01-01T00:00:00Z'),
    resolvedAt: null,
    ...overrides,
  }
}

function makeStore(records: WebhookDeadLetterRecord[]): { store: IWebhookDeadLetterStore; listUnresolved: ReturnType<typeof vi.fn> } {
  const listUnresolved = vi.fn(async (_accountId?: string) => records)
  const store: IWebhookDeadLetterStore = {
    record: vi.fn(),
    listUnresolved,
    markResolved: vi.fn(),
  }
  return { store, listUnresolved }
}

describe('ListWebhookDeadLettersUseCase', () => {
  it('lists only bank_transaction dead letters for the account', async () => {
    const records = [
      record({ id: 'dl-1', subjectType: 'bank_transaction', subjectId: 'tx-1' }),
      record({ id: 'dl-2', subjectType: 'conciliation_request', subjectId: 'cr-1' }),
      record({ id: 'dl-3', subjectType: 'bank_transaction', subjectId: 'tx-2' }),
    ]
    const { store, listUnresolved } = makeStore(records)
    const useCase = new ListWebhookDeadLettersUseCase({ deadLetters: store })

    const result = await useCase.execute('acc-1')

    expect(listUnresolved).toHaveBeenCalledWith('acc-1')
    // conciliation_request is filtered out; only the two bank_transaction rows remain.
    expect(result.map((d) => d.id)).toEqual(['dl-1', 'dl-3'])
  })

  it('returns an empty array when the account has no bank_transaction dead letters', async () => {
    const { store } = makeStore([record({ subjectType: 'conciliation_request' })])
    const useCase = new ListWebhookDeadLettersUseCase({ deadLetters: store })

    await expect(useCase.execute('acc-1')).resolves.toEqual([])
  })
})
