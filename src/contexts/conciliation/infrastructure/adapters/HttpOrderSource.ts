import { IOrderSource, PendingOrder } from '../../domain/ports/IOrderSource.js'
import { PollingConfig } from '../../domain/ports/IAccountConfigReader.js'
import { ValidationError } from '../../../../shared/errors/index.js'
import type { ILogger } from '../../../../shared/logger/ILogger.js'

export class HttpOrderSource implements IOrderSource {
  constructor(private readonly logger?: ILogger) {}

  async fetch(config: PollingConfig): Promise<PendingOrder[]> {
    if (!config.pendingOrdersEndpoint) return []

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.authToken) {
      headers['Authorization'] =
        config.authType === 'api_key'
          ? `Api-Key ${config.authToken}`
          : `Bearer ${config.authToken}`
    }

    const isPost = config.pollingMethod === 'POST'
    const response = await fetch(config.pendingOrdersEndpoint, {
      method: config.pollingMethod,
      headers,
      body: isPost ? JSON.stringify(config.pollingBody ?? {}) : undefined,
      signal: AbortSignal.timeout(Number(process.env.POLLING_TIMEOUT_MS ?? 15_000)),
    })

    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok) {
      const bodySnippet = await response.text().catch(() => '')
      throw new Error(
        `Polling failed: ${response.status} ${response.statusText} (content-type: ${contentType})` +
          (bodySnippet ? ` body: ${bodySnippet.slice(0, 300)}` : '')
      )
    }

    if (!contentType.toLowerCase().includes('application/json')) {
      const bodySnippet = await response.text().catch(() => '')
      throw new Error(
        `Polling returned non-JSON response (content-type: ${contentType})` +
          (bodySnippet ? ` body: ${bodySnippet.slice(0, 300)}` : '')
      )
    }

    const raw: any = await response.json()
    const orders: any[] | null = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : null
    if (!orders) {
      throw new ValidationError(
        `Polling response must be a JSON array of orders (got: ${JSON.stringify(raw).slice(0, 200)})`
      )
    }

    const out: PendingOrder[] = []
    for (const o of orders) {
      if (!o.external_id || o.amount == null || !o.currency || !o.name) {
        this.logger?.warn('skipping order missing required fields', { order: o })
        continue
      }
      out.push({
        externalId: String(o.external_id),
        amount: Number(o.amount),
        currency: String(o.currency),
        senderName: String(o.name),
      })
    }
    return out
  }
}
