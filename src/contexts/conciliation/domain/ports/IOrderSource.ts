import type { PollingConfig } from './IAccountConfigReader.js'

export interface PendingOrder {
  externalId: string
  amount: number
  currency: string
  senderName: string
}

export interface IOrderSource {
  fetch(config: PollingConfig): Promise<PendingOrder[]>
}
