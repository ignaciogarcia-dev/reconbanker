import { describe, it, expect, vi } from 'vitest'

const sendWebhookMock = vi.fn()
vi.mock('../../../shared/infrastructure/webhooks/WebhookSender.js', () => ({
  sendWebhook: (...args: unknown[]) => sendWebhookMock(...args),
}))

import { NotifyBankMovementUseCase } from './NotifyBankMovementUseCase.js'
import { InMemoryBankTransactionRepository } from '../../../../tests/helpers/inMemoryBankRepos.js'
import { BankTransaction } from '../domain/BankTransaction.js'

function makeLog() {
  return { record: vi.fn().mockResolvedValue(undefined) }
}

function txFixture(id = 'tx-1') {
  return BankTransaction.create(id, {
    accountId: 'acc-1', externalId: 'ext-1', referenceHash: 'h', amount: 100,
    currency: 'USD', senderName: 'Alice', receivedAt: new Date(),
    scriptId: 'script-1', rawPayload: {},
  })
}

function buildSut(opts: {
  mode?: 'passthrough' | 'reconcile' | null
  webhookUrl?: string | null
  silentIngestion?: boolean
} = {}) {
  const bankTxRepo = new InMemoryBankTransactionRepository()
  const tx = txFixture()
  bankTxRepo.store.set(tx.id, tx)
  const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
  const webhookLog = makeLog()
  const useCase = new NotifyBankMovementUseCase({
    bankTxRepo,
    accountReader: { findById: async () => ({ id: 'acc-1', userId: 'user-1', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
    configReader: {
      findByAccountId: async () => ({
        accountId: 'acc-1',
        webhookUrl: opts.webhookUrl === undefined ? 'https://hook.example.com' : opts.webhookUrl,
        webhookAuthType: null, webhookAuthToken: null,
        authType: 'bearer', authToken: 'tok',
        webhookExtraFields: { source: 'bank' },
        silentIngestion: opts.silentIngestion ?? false,
      }),
    },
    userModeReader: { getOperationMode: async () => opts.mode ?? 'passthrough' },
    webhookLog,
    sendWebhookFn,
  })
  return { useCase, bankTxRepo, sendWebhookFn, webhookLog, tx }
}

describe('NotifyBankMovementUseCase', () => {
  it('sends the webhook when mode is passthrough and claims the notification', async () => {
    const { useCase, bankTxRepo, sendWebhookFn, tx } = buildSut()
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).toHaveBeenCalledTimes(1)
    expect(bankTxRepo.notified.has(tx.id)).toBe(true)
  })

  it('records a webhook_notifications entry on success with subject context', async () => {
    const { useCase, webhookLog, tx } = buildSut()
    await useCase.execute({ bankTransactionId: tx.id, attempt: 2 })
    expect(webhookLog.record).toHaveBeenCalledTimes(1)
    expect(webhookLog.record).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acc-1',
      subjectType: 'bank_transaction',
      subjectId: tx.id,
      attempt: 2,
      responseStatus: 200,
      errorMessage: null,
    }))
  })

  it('records a failure entry, releases the claim, and rethrows', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const tx = txFixture()
    bankTxRepo.store.set(tx.id, tx)
    const err = Object.assign(new Error('Webhook failed: 500'), { status: 500, body: 'boom' })
    const sendWebhookFn = vi.fn().mockRejectedValue(err)
    const webhookLog = makeLog()
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'user-1', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      configReader: { findByAccountId: async () => ({
        accountId: 'acc-1', webhookUrl: 'https://hook',
        webhookAuthType: null, webhookAuthToken: null,
        authType: 'bearer', authToken: 'tok',
        webhookExtraFields: null, silentIngestion: false,
      }) },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog,
      sendWebhookFn,
    })
    await expect(useCase.execute({ bankTransactionId: tx.id })).rejects.toThrow('Webhook failed: 500')
    expect(webhookLog.record).toHaveBeenCalledWith(expect.objectContaining({
      subjectType: 'bank_transaction', subjectId: tx.id,
      responseStatus: 500, responseBody: 'boom', errorMessage: 'Webhook failed: 500',
      attempt: 1,
    }))
    expect(bankTxRepo.notified.has(tx.id)).toBe(false)
  })

  it('does nothing when mode is reconcile', async () => {
    const { useCase, sendWebhookFn, webhookLog, tx } = buildSut({ mode: 'reconcile' })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
    expect(webhookLog.record).not.toHaveBeenCalled()
  })

  it('does nothing when webhook url is missing', async () => {
    const { useCase, sendWebhookFn, tx } = buildSut({ webhookUrl: null })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('skips sending when silentIngestion is true but still claims notification', async () => {
    const { useCase, bankTxRepo, sendWebhookFn, webhookLog, tx } = buildSut({ silentIngestion: true })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
    expect(webhookLog.record).not.toHaveBeenCalled()
    expect(bankTxRepo.notified.has(tx.id)).toBe(true)
  })

  it('does not double-send if claim is already taken', async () => {
    const { useCase, bankTxRepo, sendWebhookFn, tx } = buildSut()
    bankTxRepo.notified.add(tx.id)
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('returns early when the bank transaction does not exist', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => null },
      configReader: { findByAccountId: async () => null },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog: makeLog(),
      sendWebhookFn,
    })
    await useCase.execute({ bankTransactionId: 'missing' })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('returns early when no config is found for the account', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const tx = txFixture()
    bankTxRepo.store.set(tx.id, tx)
    const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      configReader: { findByAccountId: async () => null },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog: makeLog(),
      sendWebhookFn,
    })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('returns early when no account is found', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const tx = txFixture()
    bankTxRepo.store.set(tx.id, tx)
    const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => null },
      configReader: { findByAccountId: async () => ({
        accountId: 'acc-1', webhookUrl: 'https://hook',
        webhookAuthType: null, webhookAuthToken: null,
        authType: null, authToken: null,
        webhookExtraFields: null, silentIngestion: false,
      }) },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog: makeLog(),
      sendWebhookFn,
    })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('returns early when the transaction has no senderName', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const tx = BankTransaction.create('tx-2', {
      accountId: 'acc-1', externalId: 'ext-2', referenceHash: 'h', amount: 50,
      currency: 'USD', senderName: undefined, receivedAt: new Date(),
      scriptId: 'script-1', rawPayload: {},
    })
    bankTxRepo.store.set(tx.id, tx)
    const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      configReader: { findByAccountId: async () => ({
        accountId: 'acc-1', webhookUrl: 'https://hook',
        webhookAuthType: null, webhookAuthToken: null,
        authType: null, authToken: null,
        webhookExtraFields: null, silentIngestion: false,
      }) },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog: makeLog(),
      sendWebhookFn,
    })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('passes a string receivedAt through unchanged and skips colliding extra fields', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const isoDate = '2024-01-05T10:00:00Z'
    const tx = BankTransaction.reconstitute('tx-3', {
      accountId: 'acc-1', externalId: 'ext-3', referenceHash: 'h', amount: 50,
      currency: 'USD', senderName: 'Bob',
      receivedAt: isoDate as unknown as Date,
      scriptId: 'script-1', ingestedAt: new Date(), rawPayload: {},
    })
    bankTxRepo.store.set(tx.id, tx)
    const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      configReader: { findByAccountId: async () => ({
        accountId: 'acc-1', webhookUrl: 'https://hook',
        webhookAuthType: null, webhookAuthToken: null,
        authType: 'bearer', authToken: 'tok',
        // 'id' collides with payload.id → should be skipped; 'source' is new.
        webhookExtraFields: { id: 'override-attempt', source: 'bank' },
        silentIngestion: false,
      }) },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog: makeLog(),
      sendWebhookFn,
    })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).toHaveBeenCalledTimes(1)
    const payload = (sendWebhookFn.mock.calls[0][0] as any).payload
    expect(payload.received_at).toBe(isoDate)
    expect(payload.id).toBe('tx-3')
    expect(payload.source).toBe('bank')
  })

  it('uses the default sendWebhook when no sendWebhookFn is provided', async () => {
    sendWebhookMock.mockReset()
    sendWebhookMock.mockResolvedValue({ status: 200, body: '' })
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const tx = txFixture('tx-default')
    bankTxRepo.store.set(tx.id, tx)
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      configReader: { findByAccountId: async () => ({
        accountId: 'acc-1', webhookUrl: 'https://hook',
        webhookAuthType: null, webhookAuthToken: null,
        authType: 'bearer', authToken: 'tok',
        webhookExtraFields: null, silentIngestion: false,
      }) },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog: makeLog(),
    })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookMock).toHaveBeenCalledTimes(1)
  })

  it('skips extra fields when webhookExtraFields is not an object', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const tx = txFixture('tx-4')
    bankTxRepo.store.set(tx.id, tx)
    const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      configReader: { findByAccountId: async () => ({
        accountId: 'acc-1', webhookUrl: 'https://hook',
        webhookAuthType: null, webhookAuthToken: null,
        authType: 'bearer', authToken: 'tok',
        webhookExtraFields: ['arr'] as unknown as Record<string, unknown>,
        silentIngestion: false,
      }) },
      userModeReader: { getOperationMode: async () => 'passthrough' as const },
      webhookLog: makeLog(),
      sendWebhookFn,
    })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).toHaveBeenCalledTimes(1)
    const payload = (sendWebhookFn.mock.calls[0][0] as any).payload
    expect(payload.arr).toBeUndefined()
  })
})
