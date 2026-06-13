// Maps a backend VALIDATION_ERROR (central error middleware shape) to per-field messages,
// keyed by the first segment of each issue path (e.g. 'email', 'password').
export function fieldErrorsFromApiError(err: unknown): Partial<Record<string, string>> {
  const error = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  if (!error || typeof error !== 'object') return {}
  const { code, details } = error as {
    code?: unknown
    details?: { issues?: Array<{ path?: unknown[]; message?: unknown }> }
  }
  if (code !== 'VALIDATION_ERROR') return {}
  const fields: Partial<Record<string, string>> = {}
  for (const issue of details?.issues ?? []) {
    const field = issue.path?.[0]
    if (typeof field !== 'string' || typeof issue.message !== 'string') continue
    if (!fields[field]) fields[field] = issue.message
  }
  return fields
}
