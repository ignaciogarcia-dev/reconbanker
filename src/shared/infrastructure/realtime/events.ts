// Shared system event taxonomy where new types are added here and consumers filter on `type`
export type SystemEventType =
  | 'assistance.requested'
  | 'assistance.fulfilled'
  | 'assistance.cancelled'
  | 'login.failed'
  | 'scrape.failed'
  | 'scrape.succeeded'
  | 'session.started'
  | 'session.stopped'

export interface SystemEvent {
  type: SystemEventType
  userId: string
  accountId: string
  // Free-form payload such as the OTP descriptor on assistance.requested
  data?: Record<string, unknown>
  occurredAt: string // ISO 8601
}

// Subscribable subset stored in account_config.notification_events and kept narrow since internal lifecycle events are not externally notifiable
export type NotifiableEventType = 'assistance_required' | 'login_failed' | 'scrape_failed'

// Maps an internal type to its externally notifiable name or null when dashboard-only
export function toNotifiableType(type: SystemEventType): NotifiableEventType | null {
  switch (type) {
    case 'assistance.requested': return 'assistance_required'
    case 'login.failed': return 'login_failed'
    case 'scrape.failed': return 'scrape_failed'
    default: return null
  }
}
