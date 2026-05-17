export abstract class DomainError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.details = details
  }
}
