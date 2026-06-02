import { sendWebhook } from './WebhookSender.js'
import { IWebhookNotificationLog, WebhookSubjectType } from './IWebhookNotificationLog.js'

export interface WebhookSubjectContext {
  accountId: string
  subjectType: WebhookSubjectType
  subjectId: string
  attempt: number
}

/**
 * Wraps the pure `sendWebhook` so every delivery attempt — success or failure —
 * is recorded to the shared notification log, without putting DB access into the
 * sender itself. Returns a function matching `typeof sendWebhook` so it drops in
 * as a use case's `sendWebhookFn`. Re-throws on failure to preserve retry semantics.
 */
export function makeLoggingWebhookSender(
  log: IWebhookNotificationLog,
  ctx: WebhookSubjectContext,
  inner: typeof sendWebhook = sendWebhook,
): typeof sendWebhook {
  return async (opts) => {
    try {
      const result = await inner(opts)
      await log.record({
        ...ctx,
        url: opts.url,
        requestPayload: opts.payload,
        responseStatus: result.status,
        responseBody: result.body,
        errorMessage: null,
      })
      return result
    } catch (err) {
      const status = typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : null
      const body = typeof (err as { body?: unknown }).body === 'string'
        ? (err as { body: string }).body
        : null
      await log.record({
        ...ctx,
        url: opts.url,
        requestPayload: opts.payload,
        responseStatus: status,
        responseBody: body,
        errorMessage: (err as Error).message,
      })
      throw err
    }
  }
}
