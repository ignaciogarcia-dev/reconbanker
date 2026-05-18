import { httpClient } from '@/shared/http/client'
import type { Script } from '../types'

export async function listScripts(): Promise<Script[]> {
  const { data } = await httpClient.get<Script[]>('/scripts')
  return data
}

export async function promoteScript(scriptId: string): Promise<void> {
  await httpClient.post(`/scripts/${scriptId}/promote`)
}
