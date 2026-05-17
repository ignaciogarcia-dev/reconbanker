import { IBankMovementReadModel } from '../domain/ports/IBankMovementReadModel.js'
import {
  BankMovementListItemDto,
  ListBankMovementsFilter,
} from './dto/BankMovementDto.js'

export class ListBankMovementsUseCase {
  constructor(private readonly readModel: IBankMovementReadModel) {}

  execute(filter: ListBankMovementsFilter): Promise<BankMovementListItemDto[]> {
    return this.readModel.list(filter)
  }
}
