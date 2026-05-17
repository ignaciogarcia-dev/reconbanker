import { DomainError } from './DomainError.js'

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT'
  readonly statusCode = 409
}
