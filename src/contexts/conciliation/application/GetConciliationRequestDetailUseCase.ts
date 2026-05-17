import { IConciliationReadModel } from '../domain/ports/IConciliationReadModel.js'
import { ConciliationRequestDetailDto } from './dto/ConciliationRequestDto.js'
import { NotFoundError } from '../../../shared/errors/index.js'

export class GetConciliationRequestDetailUseCase {
  constructor(private readonly readModel: IConciliationReadModel) {}

  async execute(requestId: string, userId: string): Promise<ConciliationRequestDetailDto> {
    const detail = await this.readModel.findDetailForUser(requestId, userId)
    if (!detail) throw new NotFoundError('Conciliation request not found')
    return detail
  }
}
