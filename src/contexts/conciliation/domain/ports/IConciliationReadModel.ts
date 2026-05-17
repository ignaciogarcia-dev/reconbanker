import type {
  ConciliationRequestListItemDto,
  ConciliationRequestDetailDto,
  ListConciliationRequestsFilter,
} from '../../application/dto/ConciliationRequestDto.js'

export interface IConciliationReadModel {
  list(filter: ListConciliationRequestsFilter): Promise<ConciliationRequestListItemDto[]>
  findDetailForUser(requestId: string, userId: string): Promise<ConciliationRequestDetailDto | null>
}
