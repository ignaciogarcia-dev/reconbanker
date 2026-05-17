import type {
  BankMovementListItemDto,
  ListBankMovementsFilter,
} from '../../application/dto/BankMovementDto.js'

export interface IBankMovementReadModel {
  list(filter: ListBankMovementsFilter): Promise<BankMovementListItemDto[]>
}
