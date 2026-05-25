import { describe, it, expect } from 'vitest'
import { buildScriptEngineModule } from './scriptEngineModule.js'
import { PromoteScriptUseCase } from '../contexts/script-engine/application/PromoteScriptUseCase.js'
import { ListScriptsUseCase } from '../contexts/script-engine/application/ListScriptsUseCase.js'
import { GetScriptDetailUseCase } from '../contexts/script-engine/application/GetScriptDetailUseCase.js'

describe('buildScriptEngineModule', () => {
  it('wires every script-engine use case', () => {
    const pool: any = { query: () => Promise.resolve({ rows: [] }) }
    const eventBus: any = { publish: () => Promise.resolve(), subscribe: () => {} }
    const unitOfWork: any = { run: async (fn: any) => fn({}) }

    const mod = buildScriptEngineModule({ pool, eventBus, unitOfWork })

    expect(mod.promoteScript).toBeInstanceOf(PromoteScriptUseCase)
    expect(mod.listScripts).toBeInstanceOf(ListScriptsUseCase)
    expect(mod.getScriptDetail).toBeInstanceOf(GetScriptDetailUseCase)
    expect(mod.bankScriptRepository).toBeDefined()
  })
})
