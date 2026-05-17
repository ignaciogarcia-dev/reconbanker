import { IBankScriptRepository } from '../domain/IBankScriptRepository.js'
import { ScriptListItemDto } from './dto/ScriptDto.js'

export class ListScriptsUseCase {
  constructor(private readonly scriptRepo: IBankScriptRepository) {}

  async execute(): Promise<ScriptListItemDto[]> {
    const items = await this.scriptRepo.findAll()
    return items.map((s) => ({
      id: s.id,
      bank: s.bank,
      flowType: s.flowType,
      version: s.version,
      status: s.status,
      origin: s.origin,
      createdAt: s.createdAt,
    }))
  }
}
