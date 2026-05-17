import { IAccountConfigReader } from '../domain/ports/IAccountConfigReader.js'
import { IConciliationRequestRepository } from '../domain/IConciliationRequestRepository.js'
import { IConciliatedTransactionRepository } from '../domain/IConciliatedTransactionRepository.js'
import { sendWebhook } from '../../../shared/infrastructure/webhooks/WebhookSender.js'

interface JobData { requestId: string }

const NOTIFIABLE_STATUSES = new Set(['matched', 'ambiguous', 'expired'])

export interface NotifyWebhookDeps {
  requestRepo: IConciliationRequestRepository
  matchRepo: IConciliatedTransactionRepository
  configReader: IAccountConfigReader
  sendWebhookFn?: typeof sendWebhook
}

export class NotifyWebhookUseCase {
  constructor(private readonly deps: NotifyWebhookDeps) {}

  async execute({ requestId }: JobData): Promise<void> {
    const { requestRepo, matchRepo, configReader } = this.deps
    const send = this.deps.sendWebhookFn ?? sendWebhook

    const request = await requestRepo.findById(requestId)
    if (!request) return
    if (!NOTIFIABLE_STATUSES.has(request.status)) return

    const config = await configReader.findWebhookConfigForRequest(requestId)
    if (!config?.webhookUrl) return

    const match = request.status === 'matched'
      ? await matchRepo.findPrimaryByRequest(requestId)
      : null

    const webhookToken = pickToken(config.webhookAuthToken, config.authToken)
    const webhookAuthType = (config.webhookAuthType ?? config.authType ?? 'bearer') as 'bearer' | 'api_key'

    const payload: Record<string, unknown> = {
      external_id: request.externalId,
      status: request.status,
      amount: request.expectedAmount,
      currency: request.currency,
      name: request.senderName ?? null,
    }

    const extras = config.webhookExtraFields
    if (extras && typeof extras === 'object' && !Array.isArray(extras)) {
      for (const [k, v] of Object.entries(extras as Record<string, unknown>)) {
        if (!(k in payload)) payload[k] = v
      }
    }

    await send({
      url: config.webhookUrl,
      payload,
      authType: webhookAuthType,
      authToken: webhookToken,
    })

    if (match) await matchRepo.markNotified(match.id)
  }
}

function pickToken(primary: string | null, fallback: string | null): string | null {
  if (typeof primary === 'string' && primary.trim()) return primary.trim()
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim()
  return null
}
