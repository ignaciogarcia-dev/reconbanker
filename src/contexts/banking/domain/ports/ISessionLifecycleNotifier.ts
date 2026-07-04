// Fire-and-forget emission of persistent-session lifecycle changes to the dashboard
// (+ webhook/Slack for needs_attention). Kept as a port so SessionManager stays free of
// realtime infrastructure and remains unit-testable.
export interface ISessionLifecycleNotifier {
  emitStarted(args: { userId: string; accountId: string }): void
  emitStopped(args: { userId: string; accountId: string; reason: string }): void
  emitNeedsAttention(args: { userId: string; accountId: string; reason: string; notify?: boolean }): void
  // Fired when a parked session finished re-authenticating (recovery notice).
  emitRecovered(args: { userId: string; accountId: string }): void
}
