import type pg from 'pg'
import type { Redis } from 'ioredis'
import { db } from '../shared/infrastructure/db/client.js'
import { logger as defaultLogger } from '../shared/infrastructure/logger/index.js'
import type { ILogger } from '../shared/logger/ILogger.js'
import { InMemoryEventBus } from '../shared/events/InMemoryEventBus.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import { PgUnitOfWork } from '../shared/persistence/PgUnitOfWork.js'
import type { IUnitOfWork } from '../shared/persistence/IUnitOfWork.js'
import { WebhookNotificationLogRepository } from '../shared/infrastructure/webhooks/WebhookNotificationLogRepository.js'
import type { IWebhookNotificationLog } from '../shared/infrastructure/webhooks/IWebhookNotificationLog.js'
import { buildUserModule, type UserModule } from './userModule.js'
import { buildAccountModule, type AccountModule } from './accountModule.js'
import { buildBankingModule, type BankingModule } from './bankingModule.js'
import { buildConciliationModule, type ConciliationModule } from './conciliationModule.js'
import { buildScriptEngineModule, type ScriptEngineModule } from './scriptEngineModule.js'

export interface Container {
  pool: pg.Pool
  redis?: Redis
  logger: ILogger
  eventBus: IEventBus
  unitOfWork: IUnitOfWork
  webhookLog: IWebhookNotificationLog
  user: UserModule
  account: AccountModule
  banking: BankingModule
  conciliation: ConciliationModule
  scriptEngine: ScriptEngineModule
}

export interface ContainerOverrides {
  pool?: pg.Pool
  logger?: ILogger
  eventBus?: IEventBus
  redis?: Redis
}

export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const pool = overrides.pool ?? db
  const logger = overrides.logger ?? defaultLogger
  const eventBus = overrides.eventBus ?? new InMemoryEventBus(logger)
  const unitOfWork = new PgUnitOfWork(pool)
  const webhookLog = new WebhookNotificationLogRepository({
    query: (text, params) => pool.query(text, params as any),
  })

  // Modules are wired sequentially; downstream modules pull from already-built ones.
  const container = { pool, logger, eventBus, unitOfWork, redis: overrides.redis, webhookLog } as unknown as Container
  container.user = buildUserModule(container)
  container.account = buildAccountModule(container)
  container.banking = buildBankingModule(container)
  container.conciliation = buildConciliationModule(container)
  container.scriptEngine = buildScriptEngineModule(container)
  return container
}
