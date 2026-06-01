/**
 * Sentinel returned to clients in place of stored secrets (auth tokens).
 * On update, receiving this sentinel means "keep the existing stored value",
 * so secrets are never exposed in responses nor accidentally cleared on save.
 */
export const SECRET_PRESENT_MASK = '__secret_present__'
