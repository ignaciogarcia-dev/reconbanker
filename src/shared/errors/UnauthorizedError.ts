import { DomainError } from './DomainError.js'

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED'
  readonly statusCode = 401
}
