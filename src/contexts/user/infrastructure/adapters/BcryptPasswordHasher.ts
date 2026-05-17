import bcrypt from 'bcrypt'
import { IPasswordHasher } from '../../domain/ports/IPasswordHasher.js'

export class BcryptPasswordHasher implements IPasswordHasher {
  constructor(private readonly rounds = 10) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds)
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash)
  }
}
