import { httpClient } from '@/shared/http/client'
import type { Bank } from '../types'

interface BankRow {
  id: string
  code: string
  name: string
  loginUrl: string | null
  status: Bank['status']
}

export async function listBanks(): Promise<Bank[]> {
  const { data } = await httpClient.get<BankRow[]>('/banks')
  return data.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    loginUrl: r.loginUrl,
    status: r.status,
  }))
}
