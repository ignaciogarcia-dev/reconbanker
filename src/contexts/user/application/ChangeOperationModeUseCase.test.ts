import { describe, expect, it, vi } from 'vitest'
import { ChangeOperationModeUseCase } from './ChangeOperationModeUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'

describe('ChangeOperationModeUseCase', () => {
  const buildUser = (currentMode: 'reconcile' | 'passthrough' = 'reconcile') => {
    const events: Array<{ eventType: string }> = []
    let mode = currentMode
    return {
      id: 'u-1',
      get domainEvents() {
        return events
      },
      changeOperationMode(next: 'reconcile' | 'passthrough') {
        if (mode === next) return
        mode = next
        events.push({ eventType: 'OperationModeChanged' })
      },
      clearDomainEvents() {
        events.length = 0
      },
    }
  }

  it('wipes data, saves the user, and publishes events', async () => {
    const user = buildUser('reconcile')
    const save = vi.fn().mockResolvedValue(undefined)
    const userRepoWithTx = { save }
    const userRepo = {
      findById: vi.fn().mockResolvedValue(user),
      withTx: vi.fn().mockReturnValue(userRepoWithTx),
    } as any
    const wipeForUser = vi.fn().mockResolvedValue(undefined)
    const dataCleaner = { wipeForUser } as any
    const tx = { __tx: true }
    const unitOfWork = {
      run: vi.fn(async (work: any) => work(tx)),
    } as any
    const publishAll = vi.fn().mockResolvedValue(undefined)
    const eventBus = { publishAll } as any

    const uc = new ChangeOperationModeUseCase(userRepo, unitOfWork, dataCleaner, eventBus)
    const out = await uc.execute({ userId: 'u-1', mode: 'passthrough' })

    expect(out.mode).toBe('passthrough')
    expect(wipeForUser).toHaveBeenCalledWith(tx, 'u-1')
    expect(save).toHaveBeenCalledWith(user)
    expect(publishAll).toHaveBeenCalledTimes(1)
    expect(user.domainEvents).toEqual([])
  })

  it('throws NotFoundError when the user does not exist', async () => {
    const userRepo = { findById: vi.fn().mockResolvedValue(null) } as any
    const uc = new ChangeOperationModeUseCase(userRepo, {} as any, {} as any, {} as any)

    await expect(uc.execute({ userId: 'missing', mode: 'reconcile' })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
