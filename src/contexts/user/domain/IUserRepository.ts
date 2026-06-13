import { User, OperationMode } from './User.js'
import type { Tx } from '../../../shared/persistence/index.js'

export interface IUserRepository {
  withTx(tx: Tx): IUserRepository
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  save(user: User): Promise<void>
  getOperationMode(userId: string): Promise<OperationMode | null>
  setOperationMode(userId: string, mode: OperationMode): Promise<void>
}
