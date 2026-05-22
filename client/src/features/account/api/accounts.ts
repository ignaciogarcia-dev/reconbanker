import { httpClient } from '@/shared/http/client'
import type { Account, CreateAccountInput } from '../types'

interface AccountRow {
  id: string
  bank: string
  name: string | null
  status: Account['status']
  scrapeBlockedAt: string | null
  scrapeBlockedReason: string | null
}

export async function listAccounts(): Promise<Account[]> {
  const { data } = await httpClient.get<AccountRow[]>('/accounts')
  return data.map(toAccount)
}

export async function getAccount(accountId: string): Promise<Account> {
  const { data } = await httpClient.get<AccountRow>(`/accounts/${accountId}`)
  return toAccount(data)
}

export async function createAccount(input: CreateAccountInput): Promise<{ id: string }> {
  const { data } = await httpClient.post<{ id: string }>('/accounts', input)
  return data
}

export async function deleteAccount(accountId: string, confirmationName: string): Promise<void> {
  await httpClient.delete(`/accounts/${accountId}`, {
    data: { confirmation_name: confirmationName },
  })
}

export async function enqueueScrape(accountId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/accounts/${accountId}/scrape`)
  return data
}

export async function restartAccount(accountId: string): Promise<{ queued: boolean }> {
  const { data } = await httpClient.post<{ queued: boolean }>(`/accounts/${accountId}/restart`)
  return data
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    bank: row.bank,
    name: row.name,
    status: row.status,
    scrapeBlockedAt: row.scrapeBlockedAt,
    scrapeBlockedReason: row.scrapeBlockedReason,
  }
}
