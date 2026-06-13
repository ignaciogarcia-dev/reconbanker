import { describe, expect, it, vi, beforeEach } from 'vitest'
import { OtpAssistanceCoordinator } from './OtpAssistanceCoordinator.js'
import type { IAssistanceRequestRepository } from '../domain/IAssistanceRequestRepository.js'
import type { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'
import type { AssistanceRequest } from '../domain/AssistanceRequest.js'

const DESCRIPTOR = { length: 6, type: 'numeric' as const }

function makeRepo() {
  const pending: AssistanceRequest = {
    id: 'req-1', accountId: 'acc-1', sessionId: null, type: 'otp',
    status: 'pending', descriptor: DESCRIPTOR, attempts: 1,
    createdAt: new Date(0), updatedAt: new Date(0), fulfilledAt: null,
  }
  return {
    open: vi.fn(async () => pending),
    findPending: vi.fn(async () => pending),
    markFulfilled: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } satisfies IAssistanceRequestRepository
}

// nextImpl yields one waiter.next() result per call where null means the window elapsed with no code
function makeBus(nextImpl: () => Promise<string | null>) {
  const next = vi.fn(nextImpl)
  const close = vi.fn(async () => {})
  return {
    bus: {
      publishUserEvent: vi.fn(async () => {}),
      enqueueNotification: vi.fn(async () => {}),
      openOtpWaiter: vi.fn(async () => ({ next, close })),
    } as unknown as RealtimeBus & {
      publishUserEvent: ReturnType<typeof vi.fn>
      enqueueNotification: ReturnType<typeof vi.fn>
      openOtpWaiter: ReturnType<typeof vi.fn>
    },
    next,
    close,
  }
}

describe('OtpAssistanceCoordinator', () => {
  let repo: ReturnType<typeof makeRepo>

  beforeEach(() => { repo = makeRepo() })

  it('opens a request, emits, returns the code and marks fulfilled', async () => {
    const { bus, close } = makeBus(async () => '123456')
    const coord = new OtpAssistanceCoordinator(repo, bus, undefined, { windowMs: 10, maxResends: 3 })
    const requestOtp = coord.forSession({ accountId: 'acc-1', userId: 'u-1' })

    const code = await requestOtp(DESCRIPTOR)

    expect(code).toBe('123456')
    expect(repo.open).toHaveBeenCalledWith('acc-1', DESCRIPTOR, null)
    expect(repo.markFulfilled).toHaveBeenCalledWith('req-1')
    // both events fan out to pub sub
    expect(bus.publishUserEvent).toHaveBeenCalledTimes(2)
    // only the notifiable assistance.requested hits the notifier stream
    expect(bus.enqueueNotification).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledOnce() // waiter torn down
  })

  it('resends SMS up to the cap, then keeps waiting without resending', async () => {
    // Two empty windows then a code so with maxResends 1 the second timeout is past the cap and waits without resending
    let call = 0
    const { bus, next } = makeBus(async () => {
      call += 1
      return call <= 2 ? null : '999999'
    })
    const onResend = vi.fn(async () => {})
    const coord = new OtpAssistanceCoordinator(repo, bus, undefined, { windowMs: 1, maxResends: 1 })
    const requestOtp = coord.forSession({ accountId: 'acc-1', userId: 'u-1' })

    const code = await requestOtp(DESCRIPTOR, onResend)

    expect(code).toBe('999999')
    expect(next).toHaveBeenCalledTimes(3)
    // Resend triggered only once at the cap and not on the second timeout
    expect(onResend).toHaveBeenCalledTimes(1)
    expect(repo.markFulfilled).toHaveBeenCalledWith('req-1')
  })

  it('cancel closes the pending request and notifies the dashboard', async () => {
    const { bus } = makeBus(async () => '1')
    const coord = new OtpAssistanceCoordinator(repo, bus, undefined, { windowMs: 1, maxResends: 0 })

    await coord.cancel('acc-1', 'u-1')

    expect(repo.close).toHaveBeenCalledWith('req-1', 'cancelled')
    expect(bus.publishUserEvent).toHaveBeenCalledTimes(1)
    // assistance.cancelled is dashboard-only and never sent to the notifier stream
    expect(bus.enqueueNotification).not.toHaveBeenCalled()
  })
})
