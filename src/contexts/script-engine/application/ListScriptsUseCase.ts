import { IBankScriptRepository } from '../domain/IBankScriptRepository.js'
import { ScriptListItemDto } from './dto/ScriptDto.js'

interface Input { callerId: string }

export class ListScriptsUseCase {
  constructor(private readonly scriptRepo: IBankScriptRepository) {}

  async execute({ callerId }: Input): Promise<ScriptListItemDto[]> {
    const items = await this.scriptRepo.findAll(callerId)
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
