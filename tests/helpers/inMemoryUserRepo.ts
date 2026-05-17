import { User, OperationMode } from '../../src/contexts/user/domain/User.js'
import type { IUserRepository } from '../../src/contexts/user/domain/IUserRepository.js'

export class InMemoryUserRepository implements IUserRepository {
  store = new Map<string, User>()
  withTx() { return this }
  async findById(id: string) { return this.store.get(id) ?? null }
  async findByEmail(email: string) {
    return [...this.store.values()].find((u) => u.email === email.toLowerCase()) ?? null
  }
  async save(user: User) { this.store.set(user.id, user) }
  async getOperationMode(userId: string) {
    return this.store.get(userId)?.operationMode ?? null
  }
  async setOperationMode(userId: string, mode: OperationMode) {
    const u = this.store.get(userId)
    if (u) u.changeOperationMode(mode)
  }
}
