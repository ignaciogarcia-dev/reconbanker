import { httpClient } from '@/shared/http/client'
import type { Me, OperationMode } from '../types'

interface MeRow {
  id: string
  email: string
  name: string | null
  operation_mode: OperationMode | null
}

export async function getMe(): Promise<Me> {
  const { data } = await httpClient.get<MeRow>('/me')
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    operationMode: data.operation_mode,
  }
}

export async function setOperationMode(mode: OperationMode): Promise<{ mode: OperationMode }> {
  const { data } = await httpClient.put<{ operation_mode: OperationMode }>('/me/operation-mode', { mode })
  return { mode: data.operation_mode }
}
