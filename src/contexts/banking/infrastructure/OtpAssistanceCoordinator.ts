import { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'
import { SystemEvent, toNotifiableType } from '../../../shared/infrastructure/realtime/events.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'
import { IAssistanceRequestRepository } from '../domain/IAssistanceRequestRepository.js'
import { OtpDescriptor } from '../domain/AssistanceRequest.js'

export interface OtpAssistanceConfig {
  // Wait window in ms before considering an automatic SMS resend
  windowMs: number
  // Automatic SMS resends before falling back to wait-only
  maxResends: number
}

function loadConfig(): OtpAssistanceConfig {
  return {
    windowMs: Number(process.env.OTP_WAIT_WINDOW_MS ?? 120_000),
    maxResends: Number(process.env.OTP_MAX_RESENDS ?? 3),
  }
}

// Owns the full assistance lifecycle and past the resend cap it waits indefinitely without failing so callers must `cancel()` on session teardown
export class OtpAssistanceCoordinator {
  private readonly config: OtpAssistanceConfig

  constructor(
    private readonly repo: IAssistanceRequestRepository,
    private readonly bus: RealtimeBus,
    private readonly logger?: ILogger,
    config?: Partial<OtpAssistanceConfig>,
  ) {
    this.config = { ...loadConfig(), ...config }
  }

  // Returns a requestOtp bound to one account and user and session
  forSession(args: { accountId: string; userId: string; sessionId?: string | null }) {
    const { accountId, userId, sessionId = null } = args
    return async (descriptor: OtpDescriptor, onResend?: () => Promise<void>): Promise<string> => {
      const req = await this.repo.open(accountId, descriptor, sessionId)
      // Open the waiter BEFORE emitting the request event so an immediately submitted code can never fall into a gap
      const waiter = await this.bus.openOtpWaiter(req.id)
      this.emit('assistance.requested', { accountId, userId, descriptor, requestId: req.id, attempts: req.attempts })

      try {
        let resends = 0
        while (true) {
          const code = await waiter.next(this.config.windowMs)
          if (code) {
            await this.repo.markFulfilled(req.id)
            this.emit('assistance.fulfilled', { accountId, userId, requestId: req.id })
            return code
          }
          // Window elapsed with no code
          if (onResend && resends < this.config.maxResends) {
            resends++
            this.logger?.info('otp resend', { accountId, requestId: req.id, resends })
            await this.repo.open(accountId, descriptor, sessionId) // bump attempts
            await onResend().catch((e) => this.logger?.warn('otp resend failed', { accountId, error: String(e) }))
            this.emit('assistance.requested', { accountId, userId, descriptor, requestId: req.id, resent: true })
          } else {
            // Past the cap or without a resend hook the loop re-blocks for another window with no further SMS
            this.logger?.info('otp wait-only (resend cap reached)', { accountId, requestId: req.id })
          }
        }
      } finally {
        await waiter.close().catch(() => {})
      }
    }
  }

  // Clears a pending request and notifies the dashboard
  async cancel(accountId: string, userId: string): Promise<void> {
    const pending = await this.repo.findPending(accountId)
    if (!pending) return
    await this.repo.close(pending.id, 'cancelled')
    this.emit('assistance.cancelled', { accountId, userId, requestId: pending.id })
  }

  private emit(type: SystemEvent['type'], data: Record<string, unknown>): void {
    const event: SystemEvent = {
      type,
      userId: String(data.userId),
      accountId: String(data.accountId),
      data,
      occurredAt: new Date().toISOString(),
    }
    void this.bus.publishUserEvent(event).catch((e) => this.logger?.warn('publish failed', { error: String(e) }))
    // Dashboard-only events skip the notifier stream
    if (toNotifiableType(type)) {
      void this.bus.enqueueNotification(event).catch((e) => this.logger?.warn('notify enqueue failed', { error: String(e) }))
    }
  }
}
