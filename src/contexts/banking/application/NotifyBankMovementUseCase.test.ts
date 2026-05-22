import { describe, it, expect, vi } from 'vitest'
import { NotifyBankMovementUseCase } from './NotifyBankMovementUseCase.js'
import { InMemoryBankTransactionRepository } from '../../../../tests/helpers/inMemoryBankRepos.js'
import { BankTransaction } from '../domain/BankTransaction.js'

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
  const sendWebhookFn = vi.fn().mockResolvedValue(undefined)
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
    sendWebhookFn,
  })
  return { useCase, bankTxRepo, sendWebhookFn, tx }
}

describe('NotifyBankMovementUseCase', () => {
  it('sends the webhook when mode is passthrough and claims the notification', async () => {
    const { useCase, bankTxRepo, sendWebhookFn, tx } = buildSut()
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).toHaveBeenCalledTimes(1)
    expect(bankTxRepo.notified.has(tx.id)).toBe(true)
  })

  it('does nothing when mode is reconcile', async () => {
    const { useCase, sendWebhookFn, tx } = buildSut({ mode: 'reconcile' })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('does nothing when webhook url is missing', async () => {
    const { useCase, sendWebhookFn, tx } = buildSut({ webhookUrl: null })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })

  it('skips sending when silentIngestion is true but still claims notification', async () => {
    const { useCase, bankTxRepo, sendWebhookFn, tx } = buildSut({ silentIngestion: true })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
    expect(bankTxRepo.notified.has(tx.id)).toBe(true)
  })

  it('releases the notification claim if sending fails', async () => {
    const bankTxRepo = new InMemoryBankTransactionRepository()
    const tx = txFixture()
    bankTxRepo.store.set(tx.id, tx)
    const sendWebhookFn = vi.fn().mockRejectedValue(new Error('5xx'))
    const useCase = new NotifyBankMovementUseCase({
      bankTxRepo,
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'user-1', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      configReader: {
        findByAccountId: async () => ({
          accountId: 'acc-1', webhookUrl: 'https://hook',
          webhookAuthType: null, webhookAuthToken: null,
          authType: 'bearer', authToken: 'tok',
          webhookExtraFields: null, silentIngestion: false,
        }),
      },
      userModeReader: { getOperationMode: async () => 'passthrough' },
      sendWebhookFn,
    })
    await expect(useCase.execute({ bankTransactionId: tx.id })).rejects.toThrow('5xx')
    expect(bankTxRepo.notified.has(tx.id)).toBe(false)
  })

  it('does not double-send if claim is already taken', async () => {
    const { useCase, bankTxRepo, sendWebhookFn, tx } = buildSut()
    bankTxRepo.notified.add(tx.id)
    await useCase.execute({ bankTransactionId: tx.id })
    expect(sendWebhookFn).not.toHaveBeenCalled()
  })
})
