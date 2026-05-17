import type { IAccountConfigRepository } from '../../../account/domain/IAccountConfigRepository.js'
import {
  INotificationConfigReader,
  BankMovementNotificationConfig,
} from '../../domain/ports/INotificationConfigReader.js'

export class NotificationConfigReaderAdapter implements INotificationConfigReader {
  constructor(private readonly configRepo: IAccountConfigRepository) {}

  async findByAccountId(accountId: string): Promise<BankMovementNotificationConfig | null> {
    const cfg = await this.configRepo.findByAccountId(accountId)
    if (!cfg) return null
    return {
      accountId: cfg.accountId,
      webhookUrl: cfg.webhookUrl,
      webhookAuthType: cfg.webhookAuthType,
      webhookAuthToken: cfg.webhookAuthToken,
      authType: cfg.authType,
      authToken: cfg.authToken,
      webhookExtraFields: cfg.webhookExtraFields,
      silentIngestion: cfg.silentIngestion,
    }
  }
}
