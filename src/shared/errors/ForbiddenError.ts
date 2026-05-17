import { DomainError } from './DomainError.js'

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN'
  readonly statusCode = 403
}
