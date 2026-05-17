import { InMemoryEventBus } from './InMemoryEventBus.js'

export { InMemoryEventBus } from './InMemoryEventBus.js'
export type { IEventBus, EventHandler } from './IEventBus.js'

/**
 * Singleton legacy. Prefer injecting `IEventBus` via the composition root.
 * Kept to avoid breaking existing imports during the DDD migration.
 */
export const EventBus = new InMemoryEventBus()
