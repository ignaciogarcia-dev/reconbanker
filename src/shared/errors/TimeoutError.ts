// Control-flow signal raised by withTimeout when an operation exceeds its budget.
// Deliberately a plain Error, not a DomainError: it carries no HTTP status/code
// and never reaches the error middleware — callers catch it to fail fast.
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}
