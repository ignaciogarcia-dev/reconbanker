import { z } from 'zod'
import { IOrderSource, PendingOrder } from '../../domain/ports/IOrderSource.js'
import { PollingConfig } from '../../domain/ports/IAccountConfigReader.js'
import { ValidationError } from '../../../../shared/errors/index.js'
import { assertSafeUrl } from '../../../../shared/net/assertSafeUrl.js'
import type { ILogger } from '../../../../shared/logger/ILogger.js'

// Validates a single order from the ERP polling response. external_id may arrive
// as a string or number; amount accepts numeric strings but rejects NaN/Infinity.
// Missing/empty/non-numeric fields fail and the order is skipped (see fetch()).
const orderSchema = z
  .object({
    external_id: z.union([z.string(), z.number()]).transform(String).refine((s) => s.length > 0),
    amount: z.union([z.number(), z.string()]).transform(Number).refine(Number.isFinite),
    currency: z.string().min(1),
    name: z.string().min(1),
  })
  .transform((o) => ({
    externalId: o.external_id,
    amount: o.amount,
    currency: o.currency,
    senderName: o.name,
  }))

export class HttpOrderSource implements IOrderSource {
  constructor(private readonly logger?: ILogger) {}

  async fetch(config: PollingConfig): Promise<PendingOrder[]> {
    if (!config.pendingOrdersEndpoint) return []

    // Re-validate at poll time, not just at config write: the host may now
    // resolve to an internal address (DNS change / TOCTOU) even if it was safe
    // when the operator configured it.
    await assertSafeUrl(config.pendingOrdersEndpoint, 'pending_orders_endpoint')

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
      // redirect: 'error' prevents a polling endpoint from 3xx-redirecting us to
      // an internal address after assertSafeUrl validated the configured host.
      redirect: 'error',
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
      const parsed = orderSchema.safeParse(o)
      if (!parsed.success) {
        this.logger?.warn('skipping invalid order', { order: o, issues: parsed.error.issues })
        continue
      }
      out.push(parsed.data)
    }
    return out
  }
}
