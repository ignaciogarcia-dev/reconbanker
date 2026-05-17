import type { IUserRepository } from '../../../user/domain/IUserRepository.js'
import {
  IUserOperationModeReader,
  OperationMode,
} from '../../domain/ports/IUserOperationModeReader.js'

export class UserOperationModeReaderAdapter implements IUserOperationModeReader {
  constructor(private readonly userRepo: IUserRepository) {}

  async getOperationMode(userId: string): Promise<OperationMode | null> {
    return this.userRepo.getOperationMode(userId)
  }
}
