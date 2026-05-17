import { IBankScriptRepository } from '../domain/IBankScriptRepository.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import { ScriptDetailDto } from './dto/ScriptDto.js'

export class GetScriptDetailUseCase {
  constructor(private readonly scriptRepo: IBankScriptRepository) {}

  async execute(scriptId: string): Promise<ScriptDetailDto> {
    const s = await this.scriptRepo.findById(scriptId)
    if (!s) throw new NotFoundError('Script not found')
    return {
      id: s.id,
      bank: s.bank,
      flowType: s.flowType,
      version: s.version,
      status: s.status,
      origin: s.origin,
      createdAt: s.createdAt,
      baseScriptId: s.baseScriptId ?? null,
      codeSnapshot: s.codeSnapshot ?? null,
      selectorMap: s.selectorMap,
    }
  }
}
