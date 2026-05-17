import { IAccountRepository } from '../domain/IAccountRepository.js'
import { IAccountConfigRepository } from '../domain/IAccountConfigRepository.js'
import { IBankCredentialsRepository } from '../domain/IBankCredentialsRepository.js'
import { IUserOperationModeReader } from '../domain/ports/IUserOperationModeReader.js'
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js'
import { AccountConfigDto, UpsertAccountConfigInput } from './dto/AccountConfigDto.js'

export class UpsertAccountConfigUseCase {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly configRepo: IAccountConfigRepository,
    private readonly credentialsRepo: IBankCredentialsRepository,
    private readonly userModeReader: IUserOperationModeReader,
  ) {}

  async execute(input: UpsertAccountConfigInput): Promise<AccountConfigDto> {
    const account = await this.accountRepo.findByIdForUser(input.accountId, input.userId)
    if (!account) throw new NotFoundError('Account not found')

    if (!input.webhookUrl) {
      throw new ValidationError('webhook_url is required', { field: 'webhook_url' })
    }

    const mode = await this.userModeReader.getOperationMode(input.userId)
    const normalizedPendingEndpoint = input.pendingOrdersEndpoint?.trim() || null

    if (mode === 'reconcile' && !normalizedPendingEndpoint) {
      throw new ValidationError(
        'pending_orders_endpoint is required when operation mode is reconcile',
        { field: 'pending_orders_endpoint' }
      )
    }

    const config = await this.configRepo.upsert({
      accountId: input.accountId,
      pendingOrdersEndpoint: normalizedPendingEndpoint,
      webhookUrl: input.webhookUrl,
      retryLimit: input.retryLimit,
      pollingMethod: input.pollingMethod,
      pollingBody: input.pollingBody,
      authType: input.authType,
      authToken: input.authToken?.trim() || null,
      webhookAuthType: input.webhookAuthType,
      webhookAuthToken: input.webhookAuthToken?.trim() || null,
      notifyOnExpired: input.notifyOnExpired,
      webhookExtraFields: input.webhookExtraFields,
      silentIngestion: input.silentIngestion,
    })

    if (input.bankUsername && input.bankPassword) {
      await this.credentialsRepo.upsert({
        accountId: input.accountId,
        username: input.bankUsername,
        encryptedPassword: input.bankPassword,
      })
    }

    const bankUsername = await this.credentialsRepo.findUsernameByAccount(input.accountId)
    return { ...config, bankUsername }
  }
}
