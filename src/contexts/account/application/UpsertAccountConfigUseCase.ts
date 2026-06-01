import { IAccountRepository } from '../domain/IAccountRepository.js'
import { IAccountConfigRepository } from '../domain/IAccountConfigRepository.js'
import { IBankCredentialsRepository } from '../domain/IBankCredentialsRepository.js'
import { IUserOperationModeReader } from '../domain/ports/IUserOperationModeReader.js'
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js'
import { assertSafeUrl } from '../../../shared/net/assertSafeUrl.js'
import { SECRET_PRESENT_MASK } from './secretMask.js'
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
    await assertSafeUrl(input.webhookUrl, 'webhook_url')

    const mode = await this.userModeReader.getOperationMode(input.userId)
    const normalizedPendingEndpoint = input.pendingOrdersEndpoint?.trim() || null

    if (mode === 'reconcile' && !normalizedPendingEndpoint) {
      throw new ValidationError(
        'pending_orders_endpoint is required when operation mode is reconcile',
        { field: 'pending_orders_endpoint' }
      )
    }

    if (normalizedPendingEndpoint) {
      await assertSafeUrl(normalizedPendingEndpoint, 'pending_orders_endpoint')
    }

    // Clients receive a masked sentinel instead of the real token; echoing it
    // back on save means "leave the stored secret untouched".
    const existing = await this.configRepo.findByAccountId(input.accountId)
    const resolveSecret = (incoming: string | null, current: string | null | undefined) =>
      incoming === SECRET_PRESENT_MASK ? (current ?? null) : (incoming?.trim() || null)

    const config = await this.configRepo.upsert({
      accountId: input.accountId,
      pendingOrdersEndpoint: normalizedPendingEndpoint,
      webhookUrl: input.webhookUrl,
      retryLimit: input.retryLimit,
      pollingMethod: input.pollingMethod,
      pollingBody: input.pollingBody,
      authType: input.authType,
      authToken: resolveSecret(input.authToken, existing?.authToken),
      webhookAuthType: input.webhookAuthType,
      webhookAuthToken: resolveSecret(input.webhookAuthToken, existing?.webhookAuthToken),
      notifyOnExpired: input.notifyOnExpired,
      webhookExtraFields: input.webhookExtraFields,
      silentIngestion: input.silentIngestion,
      sessionType: input.sessionType,
      loginMode: input.loginMode,
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
