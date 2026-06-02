import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import {
  listAccounts,
  getAccount,
  createAccount,
  deleteAccount,
  enqueueScrape,
} from './accounts'

describe('accounts api', () => {
  it('listAccounts maps rows to Account[]', async () => {
    server.use(
      http.get('/api/accounts', () =>
        HttpResponse.json([
          {
            id: 'a-1',
            bank: 'mi-dinero',
            name: 'Cuenta 1',
            status: 'active',
          },
        ])
      )
    )
    const out = await listAccounts()
    expect(out).toEqual([
      {
        id: 'a-1',
        bank: 'mi-dinero',
        name: 'Cuenta 1',
        status: 'active',
      },
    ])
  })

  it('getAccount returns a single account mapped to Account shape', async () => {
    server.use(
      http.get('/api/accounts/a-9', () =>
        HttpResponse.json({
          id: 'a-9',
          bank: 'mi-dinero',
          name: null,
          status: 'inactive',
        })
      )
    )
    const account = await getAccount('a-9')
    expect(account).toEqual({
      id: 'a-9',
      bank: 'mi-dinero',
      name: null,
      status: 'inactive',
    })
  })

  it('createAccount POSTs the input and returns the new id', async () => {
    let receivedBody: unknown = null
    server.use(
      http.post('/api/accounts', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ id: 'a-2' }, { status: 201 })
      })
    )
    const result = await createAccount({ bankId: 'b-1', name: 'My Account' })
    expect(result).toEqual({ id: 'a-2' })
    expect(receivedBody).toEqual({ bankId: 'b-1', name: 'My Account' })
  })

  it('deleteAccount sends the confirmation name in the body', async () => {
    let receivedBody: unknown = null
    server.use(
      http.delete('/api/accounts/a-1', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ ok: true })
      })
    )
    await deleteAccount('a-1', 'Cuenta 1')
    expect(receivedBody).toEqual({ confirmation_name: 'Cuenta 1' })
  })

  it('enqueueScrape POSTs to the scrape endpoint and returns queued', async () => {
    server.use(
      http.post('/api/accounts/a-1/scrape', () =>
        HttpResponse.json({ queued: true })
      )
    )
    await expect(enqueueScrape('a-1')).resolves.toEqual({ queued: true })
  })
})
