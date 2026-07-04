import { useTranslation } from 'react-i18next'
import type { SessionStatus } from '../types'

// 'starting' is a UI-only overlay (not a persisted status) shown while a reactivation launches.
export type SessionLightStatus = SessionStatus | 'starting'

// Per-account live status light: green = scraping, blue = starting, amber = needs reactivation, gray = off.
export function SessionLight({ status }: { status: SessionLightStatus | null }) {
  const { t } = useTranslation('account')

  const { color, labelKey } =
    status === 'running'
      ? { color: 'bg-green-500', labelKey: 'accounts.session.light.running' }
      : status === 'starting'
        ? { color: 'bg-blue-500 animate-pulse', labelKey: 'accounts.session.light.starting' }
        : status === 'needs_attention'
          ? { color: 'bg-amber-500', labelKey: 'accounts.session.light.needs_attention' }
          : { color: 'bg-gray-300 dark:bg-gray-600', labelKey: 'accounts.session.light.off' }

  const label = t(labelKey)
  return (
    <span
      className={`inline-block size-2.5 rounded-full ${color}`}
      role="status"
      aria-label={label}
      title={label}
    />
  )
}
