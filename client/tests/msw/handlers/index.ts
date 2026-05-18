import type { HttpHandler } from 'msw'

// Per-feature handler arrays will be added in later tasks. Default to empty
// so tests opt-in to the handlers they need via `server.use(...accountHandlers)`.
export const handlers: HttpHandler[] = []
