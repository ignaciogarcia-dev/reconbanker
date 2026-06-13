import { describe, expect, it, vi } from 'vitest'
import { SubmitAssistanceCodeUseCase } from './SubmitAssistanceCodeUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import type { IAssistanceRequestRepository } from '../domain/IAssistanceRequestRepository.js'
import type { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'
import type { AssistanceRequest } from '../domain/AssistanceRequest.js'

const pending: AssistanceRequest = {
  id: 'req-1', accountId: 'acc-1', sessionId: null, type: 'otp',
  status: 'pending', descriptor: { length: 6, type: 'numeric' }, attempts: 1,
  createdAt: new Date(0), updatedAt: new Date(0), fulfilledAt: null,
}

function makeRepo(found: AssistanceRequest | null) {
  return {
    open: vi.fn(),
    findPending: vi.fn(async () => found),
    markFulfilled: vi.fn(),
    close: vi.fn(),
  } satisfies IAssistanceRequestRepository
}

describe('SubmitAssistanceCodeUseCase', () => {
  it('pushes the code onto the pending request stream', async () => {
    const repo = makeRepo(pending)
    const submitOtp = vi.fn(async () => {})
    const bus = { submitOtp } as unknown as RealtimeBus
    const useCase = new SubmitAssistanceCodeUseCase(repo, bus)

    await useCase.execute('acc-1', '123456')

    expect(repo.findPending).toHaveBeenCalledWith('acc-1')
    expect(submitOtp).toHaveBeenCalledWith('req-1', '123456')
  })

  it('throws NotFoundError when there is no pending request', async () => {
    const repo = makeRepo(null)
    const submitOtp = vi.fn(async () => {})
    const bus = { submitOtp } as unknown as RealtimeBus
    const useCase = new SubmitAssistanceCodeUseCase(repo, bus)

    await expect(useCase.execute('acc-1', '123456')).rejects.toBeInstanceOf(NotFoundError)
    expect(submitOtp).not.toHaveBeenCalled()
  })
})
