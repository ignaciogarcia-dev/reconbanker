import { describe, it, expect, vi } from 'vitest'
import { buildConciliationModule } from './conciliationModule.js'
import { RunConciliationUseCase } from '../contexts/conciliation/application/RunConciliationUseCase.js'
import { ProcessIncomingTransactionUseCase } from '../contexts/conciliation/application/ProcessIncomingTransactionUseCase.js'
import { PollPendingOrdersUseCase } from '../contexts/conciliation/application/PollPendingOrdersUseCase.js'
import { NotifyWebhookUseCase } from '../contexts/conciliation/application/NotifyWebhookUseCase.js'
import { ExpireStaleRequestsUseCase } from '../contexts/conciliation/application/ExpireStaleRequestsUseCase.js'
import { OnTransactionIngestedUseCase } from '../contexts/conciliation/application/OnTransactionIngestedUseCase.js'
import { ListConciliationRequestsUseCase } from '../contexts/conciliation/application/ListConciliationRequestsUseCase.js'
import { GetConciliationRequestDetailUseCase } from '../contexts/conciliation/application/GetConciliationRequestDetailUseCase.js'

vi.mock('../shared/infrastructure/queues/QueueRegistry.js', () => {
  const make = () => ({ add: vi.fn().mockResolvedValue(undefined) })
  return {
    redis: {} as any,
    Queues: {
      orderIngestion: make(),
      bankScrape: make(),
      conciliation: make(),
      txConciliation: make(),
      webhook: make(),
      bankMovementWebhook: make(),
    },
  }
})

function makeContainer() {
  const logger: any = { debug() {}, info() {}, warn() {}, error() {}, child() { return logger } }
  return {
    pool: { query: () => Promise.resolve({ rows: [] }) } as any,
    logger,
    eventBus: { publish: () => Promise.resolve(), subscribe: () => {} } as any,
    unitOfWork: { run: async (fn: any) => fn({}) } as any,
    banking: {
      bankTransactionRepository: { findLatestExternalId: vi.fn() } as any,
    } as any,
    account: {
      accountRepository: {} as any,
    } as any,
    user: {
      userRepository: {} as any,
    } as any,
  }
}

describe('buildConciliationModule', () => {
  it('wires every conciliation use case and exposes ownership checker', async () => {
    const mod = buildConciliationModule(makeContainer() as any)
    expect(mod.runConciliation).toBeInstanceOf(RunConciliationUseCase)
    expect(mod.processIncomingTransaction).toBeInstanceOf(ProcessIncomingTransactionUseCase)
    expect(mod.pollPendingOrders).toBeInstanceOf(PollPendingOrdersUseCase)
    expect(mod.notifyWebhook).toBeInstanceOf(NotifyWebhookUseCase)
    expect(mod.expireStaleRequests).toBeInstanceOf(ExpireStaleRequestsUseCase)
    expect(mod.onTransactionIngested).toBeInstanceOf(OnTransactionIngestedUseCase)
    expect(mod.listConciliationRequests).toBeInstanceOf(ListConciliationRequestsUseCase)
    expect(mod.getConciliationRequestDetail).toBeInstanceOf(GetConciliationRequestDetailUseCase)
    expect(mod.ownershipChecker).toBeDefined()
  })

  it('enqueue helpers add jobs onto the right queues', async () => {
    const QR: any = await import('../shared/infrastructure/queues/QueueRegistry.js')
    const mod = buildConciliationModule(makeContainer() as any)

    // The enqueueRun / enqueueWebhook / enqueueProcess closures are wired into the
    // use cases as `deps.enqueueXxx` callbacks. Invoke them directly to cover.
    await (mod.pollPendingOrders as any).deps.enqueueRun('req-1')
    await (mod.expireStaleRequests as any).deps.enqueueWebhook('req-2')
    await (mod.onTransactionIngested as any).deps.enqueueProcess('tx-3')

    expect(QR.Queues.conciliation.add).toHaveBeenCalledWith(
      'run',
      { requestId: 'req-1' },
      expect.objectContaining({ jobId: 'conciliation_req-1', removeOnComplete: true }),
    )
    expect(QR.Queues.webhook.add).toHaveBeenCalledWith(
      'notify',
      { requestId: 'req-2' },
      expect.objectContaining({ jobId: 'webhook_expired_req-2' }),
    )
    expect(QR.Queues.txConciliation.add).toHaveBeenCalledWith(
      'process',
      { transactionId: 'tx-3' },
      expect.objectContaining({ jobId: 'tx_conciliation_tx-3' }),
    )
  })
})
