import { SystemEvent, SystemEventType } from './events.js'

// Optional human-readable account identity resolved by the Notifier (bank name + user alias),
// so the message reads "Banco Pichincha · Mi cuenta sueldo" instead of a raw UUID.
export interface AccountLabel {
  bankName?: string | null
  accountName?: string | null
}

// Human-readable Spanish labels for the Slack message. The backend has no per-account
// locale, so notification text is fixed to Spanish (the operator's language).
const TYPE_META: Partial<Record<SystemEventType, { emoji: string; title: string }>> = {
  'assistance.requested': { emoji: ':bell:', title: 'Se requiere asistencia' },
  'connection.failed': { emoji: ':x:', title: 'Falla de conexión' },
  'scrape.failed': { emoji: ':warning:', title: 'Falla del scrape' },
  'connection.recovered': { emoji: ':white_check_mark:', title: 'Cuenta restablecida' },
  'scrape.recovered': { emoji: ':white_check_mark:', title: 'Cuenta restablecida' },
  'session.needs_attention': { emoji: ':rotating_light:', title: 'Sesión requiere reactivación' },
  'session.recovered': { emoji: ':white_check_mark:', title: 'Sesión reactivada' },
}

// Reasons reported on session.needs_attention (stored in event.data.reason).
const REASON_LABEL: Record<string, string> = {
  auth_timeout: 'No completó el inicio de sesión (2FA pendiente)',
  logged_out: 'Se perdió la sesión',
  watchdog_timeout: 'Dejó de responder (proceso colgado)',
  session_killed: 'Sesión detenida manualmente',
}

const CATEGORY_LABEL: Record<string, string> = {
  login_failed: 'No se pudo autenticar',
  navigation_failed: 'No se pudo conectar al banco',
  movements_fetch_failed: 'No se pudieron cargar los movimientos',
  detail_extraction_failed: 'Error extrayendo el detalle',
  timeout: 'Tiempo de espera agotado',
  unknown: 'Error desconocido',
}

// "Qué hacer" guidance per event so the operator knows whether action is needed.
const ACTION_LABEL: Partial<Record<SystemEventType, string>> = {
  'connection.failed': 'Requiere intervención de IT (revisar credenciales / login). Mientras tanto, operar manualmente hasta el aviso de restablecimiento.',
  'scrape.failed': 'No requiere intervención. Esperar al restablecimiento; mientras tanto, operar manualmente.',
}

// Recovery events render a fixed reassurance line instead of a Motivo/Qué hacer block.
const RECOVERED_BODY: Partial<Record<SystemEventType, string>> = {
  'connection.recovered': 'El scrape volvió a funcionar con normalidad.',
  'scrape.recovered': 'El scrape volvió a funcionar con normalidad.',
  'session.recovered': 'La sesión se reconectó correctamente.',
}

// Builds the Slack message text for a notifiable event. Falls back to the raw type/category and to
// "cuenta <id>" when a label or account name is missing, so a new event type or a failed name
// lookup still produces a sensible message.
export function formatSlackMessage(event: SystemEvent, label?: AccountLabel): string {
  const meta = TYPE_META[event.type] ?? { emoji: ':information_source:', title: event.type }
  const lines = [`${meta.emoji} *${meta.title}* — ${accountLabel(event, label)}`]

  const recoveredBody = RECOVERED_BODY[event.type]
  if (recoveredBody) {
    lines.push(recoveredBody)
  } else {
    const category = typeof event.data?.category === 'string' ? event.data.category : null
    if (category) lines.push(`*Motivo*: ${CATEGORY_LABEL[category] ?? category}`)

    const reason = typeof event.data?.reason === 'string' ? event.data.reason : null
    if (reason) lines.push(`*Motivo*: ${REASON_LABEL[reason] ?? reason}`)

    const action = ACTION_LABEL[event.type]
    if (action) lines.push(`*Qué hacer*: ${action}`)
  }

  lines.push(`*Hora*: ${formatTimestamp(event.occurredAt)}`)
  return lines.join('\n')
}

function accountLabel(event: SystemEvent, label?: AccountLabel): string {
  const bank = label?.bankName?.trim()
  const name = label?.accountName?.trim()
  if (bank && name) return `${bank} · ${name}`
  if (bank) return bank
  return `cuenta ${event.accountId}`
}

// Renders the ISO timestamp as a short local date-time (es). Timezone via NOTIFY_TZ, default the
// server's. Falls back to the raw string if the date or timezone is unusable.
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('es', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: process.env.NOTIFY_TZ || undefined,
    }).format(d)
  } catch {
    return iso
  }
}
