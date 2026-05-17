import type pg from 'pg'
import { db } from '../shared/infrastructure/db/client.js'
import { logger as defaultLogger } from '../shared/infrastructure/logger/index.js'
import type { ILogger } from '../shared/logger/ILogger.js'
import { InMemoryEventBus } from '../shared/events/InMemoryEventBus.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import { PgUnitOfWork } from '../shared/persistence/PgUnitOfWork.js'
import type { IUnitOfWork } from '../shared/persistence/IUnitOfWork.js'
import { buildConciliationModule, type ConciliationModule } from './conciliationModule.js'
import { buildBankingModule, type BankingModule } from './bankingModule.js'

export interface Container {
  pool: pg.Pool
  logger: ILogger
  eventBus: IEventBus
  unitOfWork: IUnitOfWork
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

  const base = { pool, logger, eventBus, unitOfWork } as Omit<Container, 'banking' | 'conciliation'>
  const container = base as Container
  container.banking = buildBankingModule(container)
  container.conciliation = buildConciliationModule(container)
  return container
}
