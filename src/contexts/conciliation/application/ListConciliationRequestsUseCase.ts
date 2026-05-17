import { IConciliationReadModel } from '../domain/ports/IConciliationReadModel.js'
import {
  ConciliationRequestListItemDto,
  ListConciliationRequestsFilter,
} from './dto/ConciliationRequestDto.js'

export class ListConciliationRequestsUseCase {
  constructor(private readonly readModel: IConciliationReadModel) {}

  execute(filter: ListConciliationRequestsFilter): Promise<ConciliationRequestListItemDto[]> {
    return this.readModel.list(filter)
  }
}
