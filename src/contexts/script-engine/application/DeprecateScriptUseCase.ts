import { IBankScriptRepository } from '../domain/IBankScriptRepository.js'
import { ForbiddenError, NotFoundError } from '../../../shared/errors/index.js'

interface Input { scriptId: string; callerId: string }

export class DeprecateScriptUseCase {
  constructor(private readonly scriptRepo: IBankScriptRepository) {}

  async execute({ scriptId, callerId }: Input): Promise<void> {
    const script = await this.scriptRepo.findById(scriptId)
    if (!script) throw new NotFoundError(`Script ${scriptId} not found`)
    if (script.userId != null && script.userId !== callerId) {
      throw new NotFoundError(`Script ${scriptId} not found`)
    }
    if (script.userId == null) {
      throw new ForbiddenError('Only the script owner can deprecate it')
    }

    script.deprecate()
    await this.scriptRepo.save(script)
  }
}
