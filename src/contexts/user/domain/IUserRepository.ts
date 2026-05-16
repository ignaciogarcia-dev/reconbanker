import { OperationMode, User } from './User.js'

export interface IUserRepository {
  findById(id: string): Promise<User | null>
  getOperationMode(userId: string): Promise<OperationMode | null>
  setOperationMode(userId: string, mode: OperationMode): Promise<void>
}
