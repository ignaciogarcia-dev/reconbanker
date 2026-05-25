import { describe, expect, it, vi } from 'vitest'
import { ReNotifyBankMovementUseCase } from './ReNotifyBankMovementUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'

describe('ReNotifyBankMovementUseCase', () => {
  it('releases the claim and enqueues a fresh notification', async () => {
    const findById = vi.fn().mockResolvedValue({ id: 'tx-1' })
    const releaseNotification = vi.fn().mockResolvedValue(undefined)
    const enqueueNotify = vi.fn().mockResolvedValue(undefined)
    const uc = new ReNotifyBankMovementUseCase({
      bankTxRepo: { findById, releaseNotification } as any,
      enqueueNotify,
    })

    await uc.execute('tx-1')

    expect(releaseNotification).toHaveBeenCalledWith('tx-1')
    expect(enqueueNotify).toHaveBeenCalledWith('tx-1')
  })

  it('throws NotFoundError when the transaction is missing', async () => {
    const findById = vi.fn().mockResolvedValue(null)
    const releaseNotification = vi.fn()
    const enqueueNotify = vi.fn()
    const uc = new ReNotifyBankMovementUseCase({
      bankTxRepo: { findById, releaseNotification } as any,
      enqueueNotify,
    })

    await expect(uc.execute('missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(releaseNotification).not.toHaveBeenCalled()
    expect(enqueueNotify).not.toHaveBeenCalled()
  })
})
