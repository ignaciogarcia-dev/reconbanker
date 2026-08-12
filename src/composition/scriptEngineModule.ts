import type pg from 'pg'
import type { IEventBus } from '../shared/events/IEventBus.js'
import type { IUnitOfWork } from '../shared/persistence/IUnitOfWork.js'
import { executorFromPool } from '../contexts/script-engine/infrastructure/Executor.js'
import { BankScriptRepository } from '../contexts/script-engine/infrastructure/BankScriptRepository.js'
import { PromoteScriptUseCase } from '../contexts/script-engine/application/PromoteScriptUseCase.js'
import { ListScriptsUseCase } from '../contexts/script-engine/application/ListScriptsUseCase.js'
import { GetScriptDetailUseCase } from '../contexts/script-engine/application/GetScriptDetailUseCase.js'
import { DeprecateScriptUseCase } from '../contexts/script-engine/application/DeprecateScriptUseCase.js'
import { PublishOfficialScriptUseCase } from '../contexts/script-engine/application/PublishOfficialScriptUseCase.js'

interface ContainerBase {
  pool: pg.Pool
  eventBus: IEventBus
  unitOfWork: IUnitOfWork
}

export interface ScriptEngineModule {
  promoteScript: PromoteScriptUseCase
  listScripts: ListScriptsUseCase
  getScriptDetail: GetScriptDetailUseCase
  deprecateScript: DeprecateScriptUseCase
  publishOfficialScript: PublishOfficialScriptUseCase
  bankScriptRepository: BankScriptRepository
}

export function buildScriptEngineModule(container: ContainerBase): ScriptEngineModule {
  const exec = executorFromPool(container.pool)
  const bankScriptRepository = new BankScriptRepository(exec)
  return {
    bankScriptRepository,
    promoteScript: new PromoteScriptUseCase(bankScriptRepository, container.unitOfWork, container.eventBus),
    listScripts: new ListScriptsUseCase(bankScriptRepository),
    getScriptDetail: new GetScriptDetailUseCase(bankScriptRepository),
    deprecateScript: new DeprecateScriptUseCase(bankScriptRepository),
    publishOfficialScript: new PublishOfficialScriptUseCase(bankScriptRepository, container.unitOfWork, container.eventBus),
  }
}
