import type pg from 'pg'
import { db } from '../shared/infrastructure/db/client.js'
import { logger as defaultLogger } from '../shared/infrastructure/logger/index.js'
import type { ILogger } from '../shared/logger/ILogger.js'
import { InMemoryEventBus } from '../shared/events/InMemoryEventBus.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import { PgUnitOfWork } from '../shared/persistence/PgUnitOfWork.js'
import type { IUnitOfWork } from '../shared/persistence/IUnitOfWork.js'
import { buildUserModule, type UserModule } from './userModule.js'
import { buildAccountModule, type AccountModule } from './accountModule.js'
import { buildBankingModule, type BankingModule } from './bankingModule.js'
import { buildConciliationModule, type ConciliationModule } from './conciliationModule.js'

export interface Container {
  pool: pg.Pool
  logger: ILogger
  eventBus: IEventBus
  unitOfWork: IUnitOfWork
  user: UserModule
  account: AccountModule
  banking: BankingModule
  conciliation: ConciliationModule
}

export interface ContainerOverrides {
  pool?: pg.Pool
  logger?: ILogger
  eventBus?: IEventBus
}

export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const pool = overrides.pool ?? db
  const logger = overrides.logger ?? defaultLogger
  const eventBus = overrides.eventBus ?? new InMemoryEventBus(logger)
  const unitOfWork = new PgUnitOfWork(pool)

  // Modules are wired sequentially; downstream modules pull from already-built ones.
  const container = { pool, logger, eventBus, unitOfWork } as unknown as Container
  container.user = buildUserModule(container)
  container.account = buildAccountModule(container)
  container.banking = buildBankingModule(container)
  container.conciliation = buildConciliationModule(container)
  return container
}
