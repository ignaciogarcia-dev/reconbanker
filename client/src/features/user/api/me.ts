import { httpClient } from '@/shared/http/client'
import type { Me, OperationMode } from '../types'

interface MeRow {
  id: string
  email: string
  name: string | null
  operation_mode: OperationMode | null
  totp_enabled?: boolean
}

export async function getMe(): Promise<Me> {
  const { data } = await httpClient.get<MeRow>('/me')
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    operationMode: data.operation_mode,
    totpEnabled: data.totp_enabled ?? false,
  }
}

export async function setOperationMode(mode: OperationMode): Promise<{ mode: OperationMode }> {
  const { data } = await httpClient.put<{ operation_mode: OperationMode }>('/me/operation-mode', { mode })
  return { mode: data.operation_mode }
}

/** Begins TOTP enrollment; returns the otpauth:// URI to render as a QR code. */
export async function enroll2fa(): Promise<{ otpauthUri: string }> {
  const { data } = await httpClient.post<{ otpauth_uri: string }>('/me/2fa/enroll')
  return { otpauthUri: data.otpauth_uri }
}

/** Confirms enrollment with a code; returns one-time backup codes (shown once). */
export async function confirm2fa(code: string): Promise<{ backupCodes: string[] }> {
  const { data } = await httpClient.post<{ backup_codes: string[] }>('/me/2fa/confirm', { code })
  return { backupCodes: data.backup_codes }
}

/** Disables 2FA; requires the current password and a valid TOTP/backup code. */
export async function disable2fa(password: string, code: string): Promise<void> {
  await httpClient.delete('/me/2fa', { data: { password, code } })
}
