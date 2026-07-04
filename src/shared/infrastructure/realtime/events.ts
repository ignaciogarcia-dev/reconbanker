// Shared system event taxonomy where new types are added here and consumers filter on `type`
export type SystemEventType =
  | 'assistance.requested'
  | 'assistance.fulfilled'
  | 'assistance.cancelled'
  // Scrape couldn't reach or authenticate the bank (login_failed / navigation_failed)
  | 'connection.failed'
  // Scrape connected but failed afterwards (extraction error, timeout, unknown)
  | 'scrape.failed'
  // The account came back after a failure streak that had already alerted
  | 'connection.recovered'
  | 'scrape.recovered'
  // Persistent monitor session lifecycle — drive the per-account live light
  | 'session.started'
  | 'session.stopped'
  // An assisted persistent session lost/failed login and parked awaiting manual reactivation
  | 'session.needs_attention'
  // An assisted persistent session finished re-authenticating after being parked (2FA entered)
  | 'session.recovered'

export interface SystemEvent {
  type: SystemEventType
  userId: string
  accountId: string
  // Free-form payload such as the OTP descriptor on assistance.requested or the failure category on connection/scrape failures
  data?: Record<string, unknown>
  occurredAt: string // ISO 8601
}

// Subscribable subset stored in account_config.notification_events and kept narrow since internal lifecycle events are not externally notifiable
export type NotifiableEventType =
  | 'assistance_required'
  | 'connection_failed'
  | 'scrape_failed'

// Maps an internal type to its externally notifiable name or null when dashboard-only
export function toNotifiableType(type: SystemEventType): NotifiableEventType | null {
  switch (type) {
    case 'assistance.requested': return 'assistance_required'
    case 'connection.failed': return 'connection_failed'
    case 'scrape.failed': return 'scrape_failed'
    // Recovery rides the same subscription as its failure so no extra config is needed
    case 'connection.recovered': return 'connection_failed'
    case 'scrape.recovered': return 'scrape_failed'
    // An assisted-persistent session parking for reactivation is an attention event, so it
    // rides the same subscription as assistance requests (there is no UI toggle of its own)
    case 'session.needs_attention': return 'assistance_required'
    // Recovery rides the same subscription as the attention alert (no toggle of its own)
    case 'session.recovered': return 'assistance_required'
    default: return null
  }
}
